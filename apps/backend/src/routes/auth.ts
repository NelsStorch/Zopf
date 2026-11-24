import { FastifyInstance, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { ChangePasswordSchema, LoginSchema } from '@zopf/shared';
import { prisma } from '../lib/prisma.js';
import { clearSessionCookie, loadSessionUser, setSessionCookie } from '../lib/auth.js';
import { failureCounter } from '../lib/login-guard.js';
import { audit } from '../lib/audit.js';

const SESSION_SHORT = '12h';
const SESSION_REMEMBER = '30d';
const REMEMBER_SECONDS = 30 * 24 * 60 * 60;

// Five misses from one address lock that address and username for 15 minutes.
const perAddress = failureCounter(5, 15 * 60 * 1000, 15 * 60 * 1000);
// Twenty misses within an hour lock the username everywhere for 15 minutes.
const perUsername = failureCounter(20, 60 * 60 * 1000, 15 * 60 * 1000);

const addressKey = (request: FastifyRequest, username: string) => `${request.ip}|${username.toLowerCase()}`;

// Compared against when the username is unknown, so both paths take as long.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', { schema: { body: LoginSchema } }, async (request, reply) => {
    const { username, password, remember } = LoginSchema.parse(request.body);
    const key = addressKey(request, username);
    const nameKey = username.toLowerCase();
    if (Math.max(perAddress.lockedFor(key), perUsername.lockedFor(nameKey)) > 0) {
      return reply.status(429).send({ error: 'locked' });
    }

    const user = await prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' } } });
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid || !user.isActive) {
      perAddress.record(key);
      perUsername.record(nameKey);
      await audit(request, 'login_failed', 'user', user?.id, { username }, null);
      return reply.status(401).send({ error: 'invalid' });
    }

    perAddress.clear(key);
    perUsername.clear(nameKey);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(request, 'login', 'user', user.id, { remember }, user.id);

    const token = app.jwt.sign({ sub: user.id, tv: user.tokenVersion }, { expiresIn: remember ? SESSION_REMEMBER : SESSION_SHORT });
    setSessionCookie(request, reply, token, remember ? REMEMBER_SECONDS : undefined);
    const { tokenVersion: _tv, ...session } = (await loadSessionUser(user.id))!;
    return { user: session };
  });

  app.post('/logout', async (request, reply) => {
    clearSessionCookie(request, reply);
    return { success: true };
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => request.auth);

  // Also ends every other session of the account (tokenVersion + 1).
  app.post('/change-password', { preHandler: [app.authenticate], schema: { body: ChangePasswordSchema } }, async (request, reply) => {
    const { currentPassword, newPassword } = ChangePasswordSchema.parse(request.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.auth.id } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return reply.status(400).send({ error: 'wrong_password' });
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12), mustChangePassword: false, tokenVersion: { increment: 1 } },
    });
    await audit(request, 'password_changed', 'user', user.id, null, user.id);
    const token = app.jwt.sign({ sub: updated.id, tv: updated.tokenVersion }, { expiresIn: SESSION_SHORT });
    setSessionCookie(request, reply, token);
    return { success: true };
  });
}

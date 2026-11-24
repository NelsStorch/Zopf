import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { FastifyBaseLogger } from 'fastify';
import { prisma } from './prisma.js';

/**
 * A database without any account gets one administrator "admin". The password
 * comes from INITIAL_ADMIN_PASSWORD or is generated and written to the log once;
 * either way it must be changed at the first login.
 */
export async function bootstrap(log: FastifyBaseLogger) {
  if ((await prisma.user.count()) > 0) return;
  const given = process.env.INITIAL_ADMIN_PASSWORD?.trim();
  const password = given || crypto.randomBytes(12).toString('base64url');
  await prisma.user.create({
    data: { username: 'admin', displayName: 'Admin', passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true },
  });
  if (given) {
    log.warn('Erstes Konto "admin" angelegt (Passwort aus INITIAL_ADMIN_PASSWORD). Beim ersten Login ändern.');
  } else {
    log.warn(`Erstes Konto "admin" angelegt. Einmaliges Passwort: ${password} (beim ersten Login ändern)`);
  }
}

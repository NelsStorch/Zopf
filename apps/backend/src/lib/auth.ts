import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SessionUser } from '@zopf/shared';
import { prisma } from './prisma.js';

/**
 * Admin session in an httpOnly cookie. Web and API share one domain (the API
 * under /api), so the cookie is first-party and SameSite=Lax keeps other
 * sites from using it.
 */
export const SESSION_COOKIE = 'zopf_session';

export interface TokenPayload {
  sub: number;
  tv: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: SessionUser;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload;
  }
}

export function setSessionCookie(request: FastifyRequest, reply: FastifyReply, token: string, maxAgeSeconds?: number) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: request.protocol === 'https',
    sameSite: 'lax',
    path: '/',
    // Without "remember me" the cookie ends with the browser.
    ...(maxAgeSeconds && { maxAge: maxAgeSeconds }),
  });
}

export function clearSessionCookie(request: FastifyRequest, reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: request.protocol === 'https', sameSite: 'lax', path: '/' });
}

/** An active account with its token version, or null (unknown or switched off). */
export async function loadSessionUser(id: number): Promise<(SessionUser & { tokenVersion: number }) | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user?.isActive) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    mustChangePassword: user.mustChangePassword,
    tokenVersion: user.tokenVersion,
  };
}

/** Routes an admin may still use while a password change is due. */
const ALLOWED_DURING_PASSWORD_CHANGE = new Set(['/api/v1/auth/me', '/api/v1/auth/logout', '/api/v1/auth/change-password']);

export function registerAuth(app: FastifyInstance) {
  app.decorateRequest('auth', null as unknown as SessionUser);

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return reply.status(401).send({ error: 'Nicht angemeldet' });
    let payload: TokenPayload;
    try {
      payload = app.jwt.verify<TokenPayload>(token);
    } catch {
      clearSessionCookie(request, reply);
      return reply.status(401).send({ error: 'Sitzung abgelaufen' });
    }
    const user = await loadSessionUser(payload.sub);
    // A switched-off account or a changed password ends the session on the next request.
    if (!user || user.tokenVersion !== payload.tv) {
      clearSessionCookie(request, reply);
      return reply.status(401).send({ error: 'Sitzung abgelaufen' });
    }
    const { tokenVersion: _tv, ...session } = user;
    if (session.mustChangePassword && !ALLOWED_DURING_PASSWORD_CHANGE.has(request.routeOptions.url ?? '')) {
      return reply.status(403).send({ error: 'Bitte zuerst das Passwort ändern', mustChangePassword: true });
    }
    request.auth = session;
  });
}

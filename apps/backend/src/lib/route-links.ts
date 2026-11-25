import crypto from 'crypto';
import { prisma } from './prisma.js';
import { config } from './config.js';
import { hashToken } from './tokens.js';

/**
 * Secret link of a route for its delivery team (no login on the street).
 *
 * The token is derived from a server secret and the moment of release, and only
 * its hash is stored. So the route sheet can be printed again at any time with the
 * same link, while "new link" (a new release moment) or withdrawing it ends the
 * old one at once. The link works until two days after the delivery date.
 */

function secret(): string {
  const value = process.env.ROUTE_LINK_SECRET?.trim() || process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET missing');
  return value;
}

export function routeToken(routeId: number, releasedAt: Date): string {
  return crypto.createHmac('sha256', secret()).update(`route:${routeId}:${releasedAt.getTime()}`).digest('base64url').slice(0, 32);
}

export const routeUrl = (token: string) => `${config.publicUrl}/route/${token}`;

/** The link of a released route, or null. */
export function routeLink(route: { id: number; releasedAt: Date | null }): string | null {
  return route.releasedAt ? routeUrl(routeToken(route.id, route.releasedAt)) : null;
}

/** Releases the route with a fresh link (also used for "new link"). */
export async function releaseRoute(routeId: number): Promise<void> {
  const releasedAt = new Date();
  await prisma.route.update({ where: { id: routeId }, data: { releasedAt, accessTokenHash: hashToken(routeToken(routeId, releasedAt)) } });
}

export async function withdrawRoute(routeId: number): Promise<void> {
  await prisma.route.update({ where: { id: routeId }, data: { releasedAt: null, accessTokenHash: null } });
}

/** Last day the link works: two days after delivery, end of day. */
export function linkValidUntil(deliveryDate: Date): Date {
  return new Date(deliveryDate.getTime() + 3 * 86_400_000 - 1);
}

/** The route behind a link, if the link is valid right now. */
export async function routeByToken(token: string) {
  const route = await prisma.route.findUnique({ where: { accessTokenHash: hashToken(token) }, include: { campaign: true, depot: true } });
  if (!route?.releasedAt) return null;
  if (new Date() > linkValidUntil(route.campaign.deliveryDate)) return null;
  return route;
}

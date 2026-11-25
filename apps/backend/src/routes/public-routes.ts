import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DeliveryEventsSchema, type DeliveryRoute } from '@zopf/shared';
import { applyDeliveryEvents, deliveryRoute } from '../lib/delivery.js';
import { routeByToken } from '../lib/route-links.js';
import { rateLimiter } from '../lib/rate-limit.js';

const TokenParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) });
const limit = rateLimiter(240, 60_000);

/**
 * The route for its delivery team, behind the secret link (no login). Shows
 * exactly what the team needs at the door: names, addresses, phone, note,
 * items and what to collect. Nothing about other routes.
 */
export async function publicRouteRoutes(app: FastifyInstance) {
  app.get('/routes/:token', { schema: { params: TokenParams } }, async (request, reply): Promise<DeliveryRoute | undefined> => {
    if (!limit(request.ip)) return reply.status(429).send({ error: 'rate_limited' });
    const route = await routeByToken(TokenParams.parse(request.params).token);
    if (!route) return reply.status(404).send({ error: 'not_found' });
    reply.header('Cache-Control', 'no-store');
    return deliveryRoute(route);
  });

  /** Ticks from the delivery view, also those queued offline. Answers with the ids it took and the current state. */
  app.post('/routes/:token/events', { schema: { params: TokenParams, body: DeliveryEventsSchema } }, async (request, reply) => {
    if (!limit(request.ip)) return reply.status(429).send({ error: 'rate_limited' });
    const route = await routeByToken(TokenParams.parse(request.params).token);
    if (!route) return reply.status(404).send({ error: 'not_found' });
    const { events } = DeliveryEventsSchema.parse(request.body);
    const { accepted } = await applyDeliveryEvents(route.id, events);
    reply.header('Cache-Control', 'no-store');
    return { accepted, route: await deliveryRoute(route) };
  });
}

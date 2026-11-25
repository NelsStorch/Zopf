import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DeliveryRoute } from '@zopf/shared';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import { formatNumber } from '../lib/orders.js';
import { routeByToken } from '../lib/route-links.js';
import { rateLimiter } from '../lib/rate-limit.js';

const TokenParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) });
const limit = rateLimiter(120, 60_000);

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
    const orders = await prisma.order.findMany({
      where: { routeId: route.id, status: 'CONFIRMED' },
      include: { items: true, campaign: { select: { orderPrefix: true } } },
      orderBy: [{ routeSeq: 'asc' }, { number: 'asc' }],
    });
    reply.header('Cache-Control', 'no-store');
    const depot = route.depot;
    return {
      route: { name: route.name, color: route.color, leaders: route.leaders },
      campaign: {
        name: route.campaign.name,
        deliveryDate: route.campaign.deliveryDate.toISOString().slice(0, 10),
        deliveryTimeText: route.campaign.deliveryTimeText,
      },
      depot: depot
        ? { name: depot.name, address: `${`${depot.street} ${depot.houseNumber}`.trim()}, ${depot.zip} ${depot.city}`, lat: depot.lat, lng: depot.lng }
        : null,
      stops: orders.map((o, index) => ({
        orderId: o.id,
        seq: index + 1,
        number: formatNumber(o),
        customerName: o.customerName,
        address: `${`${o.street} ${o.houseNumber}`.trim()}, ${o.zip} ${o.city}`,
        lat: o.lat,
        lng: o.lng,
        phone: o.phone,
        notes: o.notes,
        items: o.items.map((i) => `${i.quantity}× ${i.productName} ${i.sizeLabel}`).join(', '),
        pieces: o.items.reduce((s, i) => s + i.quantity, 0),
        openRappen: o.paymentStatus === 'OPEN' ? o.totalRappen : 0,
        paymentMethod: o.paymentMethod,
        deliveryStatus: o.deliveryStatus,
      })),
      twintPayload: config.twintPayload,
    };
  });
}

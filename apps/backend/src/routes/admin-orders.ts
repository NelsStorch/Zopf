import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AdminOrderRow } from '@zopf/shared';
import { prisma } from '../lib/prisma.js';
import { formatNumber } from '../lib/orders.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });

export async function adminOrderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  /** All orders of a campaign, newest first; unconfirmed ones too (they expire on their own). */
  app.get('/campaigns/:id/orders', { schema: { params: IdParams } }, async (request): Promise<AdminOrderRow[]> => {
    const { id } = IdParams.parse(request.params);
    const orders = await prisma.order.findMany({
      where: { campaignId: id },
      include: { items: { orderBy: { id: 'asc' } }, campaign: { select: { orderPrefix: true } } },
      orderBy: [{ number: { sort: 'desc', nulls: 'first' } }, { id: 'desc' }],
    });
    return orders.map((o) => ({
      id: o.id,
      number: formatNumber(o),
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      customerName: o.customerName,
      email: o.email,
      phone: o.phone,
      address: `${`${o.street} ${o.houseNumber}`.trim()}, ${o.zip} ${o.city}`,
      addressManual: o.addressManual,
      hasLocation: o.lat !== null && o.lng !== null,
      items: o.items.map((i) => `${i.quantity}× ${i.productName} ${i.sizeLabel}`).join(', '),
      pieces: o.items.reduce((sum, i) => sum + i.quantity, 0),
      donationRappen: o.donationRappen,
      totalRappen: o.totalRappen,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      notes: o.notes,
    }));
  });
}

import type { DeliveryEvent, DeliveryRoute } from '@zopf/shared';
import { prisma } from './prisma.js';
import { config } from './config.js';
import { formatNumber } from './orders.js';

type Route = { id: number; name: string; color: string; leaders: string | null; campaign: { name: string; deliveryDate: Date; deliveryTimeText: string | null }; depot: { name: string; street: string; houseNumber: string; zip: string; city: string; lat: number | null; lng: number | null } | null };

/** Everything the delivery view of one route shows. */
export async function deliveryRoute(route: Route): Promise<DeliveryRoute> {
  const orders = await prisma.order.findMany({
    where: { routeId: route.id, status: 'CONFIRMED' },
    include: { items: true, campaign: { select: { orderPrefix: true } } },
    orderBy: [{ routeSeq: 'asc' }, { number: 'asc' }],
  });
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
      // What is due at the door: the total, whether open or already collected here.
      openRappen: o.paymentStatus === 'OPEN' || o.paidVia === 'CASH' || o.paidVia === 'TWINT' ? o.totalRappen : 0,
      paymentMethod: o.paymentMethod,
      deliveryStatus: o.deliveryStatus,
      paymentStatus: o.paymentStatus,
      paidVia: o.paidVia,
      deliveryNote: o.deliveryNote,
    })),
    twintPayload: config.twintPayload,
  };
}

/** The data change one event stands for; null when it must not be applied. */
function changeFor(event: DeliveryEvent, order: { paymentStatus: 'OPEN' | 'PAID'; paidVia: string | null }, at: Date) {
  switch (event.field) {
    case 'delivery':
      return { deliveryStatus: event.value, deliveredAt: event.value === 'DELIVERED' ? at : null };
    case 'note':
      return { deliveryNote: event.value || null };
    case 'payment':
      // A payment by bank (ticked off in the admin) is not the team's to undo or overwrite.
      if (order.paymentStatus === 'PAID' && order.paidVia === 'BANK') return null;
      return event.value === 'OPEN' ? { paymentStatus: 'OPEN' as const, paidVia: null, paidAt: null } : { paymentStatus: 'PAID' as const, paidVia: event.value, paidAt: at };
  }
}

/**
 * Takes the changes a phone sends (possibly queued while offline). Each is
 * stored once (its id is unique); it changes the order only when no later
 * change to the same field of the same order is known already.
 */
export async function applyDeliveryEvents(routeId: number, events: DeliveryEvent[]): Promise<{ accepted: string[] }> {
  const accepted: string[] = [];
  const now = Date.now();
  for (const event of [...events].sort((a, b) => a.clientCreatedAt.localeCompare(b.clientCreatedAt))) {
    const order = await prisma.order.findFirst({ where: { id: event.orderId, routeId, status: 'CONFIRMED' } });
    // Not (or no longer) on this route: acknowledge, so the phone stops sending it.
    if (!order) {
      accepted.push(event.clientEventId);
      continue;
    }
    // A clock far in the future would win every conflict; cap it at now.
    const at = new Date(Math.min(new Date(event.clientCreatedAt).getTime(), now));
    const known = await prisma.deliveryEvent.findUnique({ where: { clientEventId: event.clientEventId } });
    if (!known) {
      const later = await prisma.deliveryEvent.findFirst({ where: { orderId: order.id, field: event.field, clientCreatedAt: { gt: at } } });
      await prisma.$transaction(async (tx) => {
        await tx.deliveryEvent.create({
          data: { clientEventId: event.clientEventId, orderId: order.id, routeId, field: event.field, value: event.value, clientCreatedAt: at },
        });
        const change = later ? null : changeFor(event, order, at);
        if (change) await tx.order.update({ where: { id: order.id }, data: change });
      });
    }
    accepted.push(event.clientEventId);
  }
  return { accepted };
}

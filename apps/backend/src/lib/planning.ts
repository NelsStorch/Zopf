import type { Planning, PlanningRoute, PlanningStop } from '@zopf/shared';
import { prisma } from './prisma.js';
import { config } from './config.js';
import { formatNumber } from './orders.js';
import { balancedClusters, haversine, osrmMatrix, pathLength, ROUTE_COLORS, sequence, straightLine, type Distance, type Point } from './routing.js';

export class PlanningError extends Error {
  constructor(
    public code: string,
    public status = 409
  ) {
    super(code);
  }
}

const confirmedOrders = (campaignId: number) =>
  prisma.order.findMany({
    where: { campaignId, status: 'CONFIRMED' },
    include: { items: true, campaign: { select: { orderPrefix: true } } },
    orderBy: [{ routeSeq: 'asc' }, { number: 'asc' }],
  });

type ConfirmedOrder = Awaited<ReturnType<typeof confirmedOrders>>[number];
const pieces = (o: ConfirmedOrder) => o.items.reduce((s, i) => s + i.quantity, 0);
/** Has a position on the map. */
function located<T extends { lat: number | null; lng: number | null }>(o: T): o is T & Point {
  return o.lat !== null && o.lng !== null;
}

export async function loadPlanning(campaignId: number): Promise<Planning | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { depots: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }, routes: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
  });
  if (!campaign) return null;
  const orders = await confirmedOrders(campaignId);

  const stops: PlanningStop[] = orders.map((o) => ({
    orderId: o.id,
    number: formatNumber(o),
    customerName: o.customerName,
    address: `${`${o.street} ${o.houseNumber}`.trim()}, ${o.zip} ${o.city}`,
    lat: o.lat,
    lng: o.lng,
    addressManual: o.addressManual,
    pieces: pieces(o),
    items: o.items.map((i) => `${i.quantity}× ${i.productName} ${i.sizeLabel}`).join(', '),
    notes: o.notes,
    openRappen: o.paymentStatus === 'OPEN' ? o.totalRappen : 0,
    routeId: o.routeId,
    routeSeq: o.routeSeq,
  }));

  const depots = new Map(campaign.depots.map((d) => [d.id, d]));
  const routes: PlanningRoute[] = campaign.routes.map((r) => {
    const own = stops.filter((s) => s.routeId === r.id).sort((a, b) => (a.routeSeq ?? 1e9) - (b.routeSeq ?? 1e9));
    const depot = r.depotId ? depots.get(r.depotId) : undefined;
    const points: Point[] = [...(depot && located(depot) ? [depot] : []), ...own.filter(located)];
    const length = points.reduce((sum, p, i) => (i === 0 ? 0 : sum + haversine(points[i - 1], p)), 0);
    return {
      id: r.id,
      name: r.name,
      color: r.color,
      leaders: r.leaders,
      depotId: r.depotId,
      released: r.releasedAt !== null,
      stops: own.length,
      pieces: own.reduce((s, o) => s + o.pieces, 0),
      openRappen: own.reduce((s, o) => s + o.openRappen, 0),
      lengthMeters: Math.round(length),
    };
  });

  return {
    campaign: { id: campaign.id, name: campaign.name },
    depots: campaign.depots.map((d) => ({ id: d.id, name: d.name, lat: d.lat, lng: d.lng, address: `${`${d.street} ${d.houseNumber}`.trim()}, ${d.zip} ${d.city}` })),
    routes,
    stops,
    roadDistances: config.osrmUrl !== null,
  };
}

/** Walking distances from OSRM when configured, straight lines otherwise. */
async function distances(start: Point, stops: Point[]): Promise<Distance> {
  const url = config.osrmUrl;
  return (url && (await osrmMatrix(url, start, stops))) || straightLine(start, stops);
}

/**
 * Puts the stops of a route in order, starting at its start point (or, without
 * one, at the stop furthest from the others' centre). Stops without a position
 * go to the end, in their current order.
 */
export async function optimizeRoute(routeId: number): Promise<void> {
  const route = await prisma.route.findUnique({ where: { id: routeId }, include: { depot: true } });
  if (!route) throw new PlanningError('not_found', 404);
  const orders = await prisma.order.findMany({ where: { routeId, status: 'CONFIRMED' }, orderBy: [{ routeSeq: 'asc' }, { id: 'asc' }] });
  const withPoint = orders.filter(located);
  const without = orders.filter((o) => !located(o));

  let ordered = withPoint;
  if (withPoint.length > 1) {
    const start: Point =
      route.depot && located(route.depot)
        ? route.depot
        : (() => {
            const c = { lat: withPoint.reduce((s, o) => s + o.lat, 0) / withPoint.length, lng: withPoint.reduce((s, o) => s + o.lng, 0) / withPoint.length };
            return withPoint.reduce((far, o) => (haversine(o, c) > haversine(far, c) ? o : far));
          })();
    const dist = await distances(start, withPoint);
    ordered = sequence(withPoint.length, dist).map((i) => withPoint[i]);
  }
  await prisma.$transaction([...ordered, ...without].map((o, index) => prisma.order.update({ where: { id: o.id }, data: { routeSeq: index + 1 } })));
}

/**
 * Plans all routes anew: deletes the existing ones (only while none has been
 * handed to a delivery team), groups the located orders into `count` routes of
 * about equal pieces, gives each route the nearest chosen start point and puts
 * its stops in order. Orders without a position stay unassigned.
 */
export async function autoPlan(campaignId: number, count: number, depotIds: number[]): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, include: { depots: true, routes: true } });
  if (!campaign) throw new PlanningError('not_found', 404);
  if (campaign.routes.some((r) => r.releasedAt)) throw new PlanningError('routes_released');
  const depots = campaign.depots.filter((d) => depotIds.includes(d.id) && located(d)) as (typeof campaign.depots[number] & Point)[];
  if (depots.length === 0) throw new PlanningError('no_depot');

  const orders = (await confirmedOrders(campaignId)).filter(located) as (ConfirmedOrder & Point)[];
  if (orders.length === 0) throw new PlanningError('no_orders');

  const groups = balancedClusters(
    orders.map((o) => ({ id: o.id, lat: o.lat, lng: o.lng, weight: pieces(o) })),
    Math.min(count, orders.length)
  );

  await prisma.$transaction(async (tx) => {
    await tx.order.updateMany({ where: { campaignId }, data: { routeId: null, routeSeq: null } });
    await tx.route.deleteMany({ where: { campaignId } });
  });

  const used = [...new Set(groups)].sort((a, b) => a - b);
  for (const [n, group] of used.entries()) {
    const members = orders.filter((_, i) => groups[i] === group);
    const centre = { lat: members.reduce((s, o) => s + o.lat, 0) / members.length, lng: members.reduce((s, o) => s + o.lng, 0) / members.length };
    const depot = depots.reduce((best, d) => (haversine(d, centre) < haversine(best, centre) ? d : best));
    const route = await prisma.route.create({
      data: { campaignId, name: `Route ${n + 1}`, color: ROUTE_COLORS[n % ROUTE_COLORS.length], depotId: depot.id, sortOrder: n },
    });
    await prisma.order.updateMany({ where: { id: { in: members.map((m) => m.id) } }, data: { routeId: route.id } });
    await optimizeRoute(route.id);
  }
}

/** Moves one order to a route (at its end) or out of all routes. */
export async function assignOrder(orderId: number, routeId: number | null): Promise<number> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (order?.status !== 'CONFIRMED') throw new PlanningError('not_found', 404);
  if (routeId !== null) {
    const route = await prisma.route.findUnique({ where: { id: routeId } });
    if (!route || route.campaignId !== order.campaignId) throw new PlanningError('not_found', 404);
    const last = await prisma.order.aggregate({ where: { routeId }, _max: { routeSeq: true } });
    await prisma.order.update({ where: { id: orderId }, data: { routeId, routeSeq: (last._max.routeSeq ?? 0) + 1 } });
  } else {
    await prisma.order.update({ where: { id: orderId }, data: { routeId: null, routeSeq: null } });
  }
  return order.campaignId;
}

/** The team set the pin by hand (address missing in the directory, or the geocoder guessed wrong). */
export async function setOrderLocation(orderId: number, lat: number, lng: number): Promise<number> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new PlanningError('not_found', 404);
  await prisma.order.update({ where: { id: orderId }, data: { lat, lng, locationSource: 'MANUAL' } });
  return order.campaignId;
}

/** Order set by hand (drag and drop or arrows in the list). */
export async function setRouteSequence(routeId: number, orderIds: number[]): Promise<number> {
  const route = await prisma.route.findUnique({ where: { id: routeId } });
  if (!route) throw new PlanningError('not_found', 404);
  await prisma.$transaction(orderIds.map((id, index) => prisma.order.updateMany({ where: { id, routeId }, data: { routeSeq: index + 1 } })));
  return route.campaignId;
}

export { pathLength };

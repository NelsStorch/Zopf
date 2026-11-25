import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AssignRouteSchema, AutoPlanSchema, RouteInputSchema, RouteSequenceSchema, SetLocationSchema } from '@zopf/shared';
import { prisma } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { assignOrder, autoPlan, loadPlanning, optimizeRoute, PlanningError, setOrderLocation, setRouteSequence } from '../lib/planning.js';
import { LOCALE_COOKIE, resolveLocale } from '@zopf/shared';
import { ROUTE_COLORS } from '../lib/routing.js';
import { releaseRoute, withdrawRoute } from '../lib/route-links.js';
import { routeSheetsPdf } from '../lib/route-sheet.js';
import { pdfDisposition } from '../lib/pdf-response.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });

/** Every change answers with the whole planning, so the page simply replaces its state. */
async function sendPlanning(reply: FastifyReply, campaignId: number) {
  const planning = await loadPlanning(campaignId);
  return planning ? reply.send(planning) : reply.status(404).send({ error: 'not_found' });
}

async function handle(reply: FastifyReply, work: () => Promise<number>) {
  try {
    return await sendPlanning(reply, await work());
  } catch (err) {
    if (err instanceof PlanningError) return reply.status(err.status).send({ error: err.code });
    throw err;
  }
}

async function routeCampaign(routeId: number) {
  const route = await prisma.route.findUnique({ where: { id: routeId }, select: { campaignId: true } });
  if (!route) throw new PlanningError('not_found', 404);
  return route.campaignId;
}

export async function adminPlanningRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/campaigns/:id/planning', { schema: { params: IdParams } }, async (request, reply) => sendPlanning(reply, IdParams.parse(request.params).id));

  app.post('/campaigns/:id/planning/auto', { schema: { params: IdParams, body: AutoPlanSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const { count, depotIds } = AutoPlanSchema.parse(request.body);
    return handle(reply, async () => {
      await autoPlan(id, count, depotIds);
      await audit(request, 'routes_planned', 'campaign', id, { count, depotIds }, request.auth.id);
      return id;
    });
  });

  app.post('/campaigns/:id/routes', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    return handle(reply, async () => {
      const n = await prisma.route.count({ where: { campaignId: id } });
      const depot = await prisma.depot.findFirst({ where: { campaignId: id }, orderBy: { sortOrder: 'asc' } });
      await prisma.route.create({ data: { campaignId: id, name: `Route ${n + 1}`, color: ROUTE_COLORS[n % ROUTE_COLORS.length], depotId: depot?.id ?? null, sortOrder: n } });
      return id;
    });
  });

  app.put('/routes/:id', { schema: { params: IdParams, body: RouteInputSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const input = RouteInputSchema.parse(request.body);
    return handle(reply, async () => {
      const campaignId = await routeCampaign(id);
      if (input.depotId !== null && !(await prisma.depot.findFirst({ where: { id: input.depotId, campaignId } }))) throw new PlanningError('not_found', 404);
      await prisma.route.update({ where: { id }, data: input });
      return campaignId;
    });
  });

  /** The orders of a deleted route become unassigned (foreign key: set null). */
  app.delete('/routes/:id', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    return handle(reply, async () => {
      const campaignId = await routeCampaign(id);
      await prisma.order.updateMany({ where: { routeId: id }, data: { routeSeq: null } });
      await prisma.route.delete({ where: { id } });
      return campaignId;
    });
  });

  app.post('/routes/:id/optimize', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    return handle(reply, async () => {
      await optimizeRoute(id);
      return routeCampaign(id);
    });
  });

  app.put('/routes/:id/sequence', { schema: { params: IdParams, body: RouteSequenceSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const { orderIds } = RouteSequenceSchema.parse(request.body);
    return handle(reply, () => setRouteSequence(id, orderIds));
  });

  app.put('/orders/:id/route', { schema: { params: IdParams, body: AssignRouteSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const { routeId } = AssignRouteSchema.parse(request.body);
    return handle(reply, () => assignOrder(id, routeId));
  });

  app.put('/orders/:id/location', { schema: { params: IdParams, body: SetLocationSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const { lat, lng } = SetLocationSchema.parse(request.body);
    return handle(reply, async () => {
      const campaignId = await setOrderLocation(id, lat, lng);
      await audit(request, 'order_location_set', 'order', id, null, request.auth.id);
      return campaignId;
    });
  });

  // ---------------------------------------------------------------- handing over

  /** Hands the route to its team: a fresh link (also "new link": the old one stops working). */
  app.post('/routes/:id/release', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    return handle(reply, async () => {
      const campaignId = await routeCampaign(id);
      await releaseRoute(id);
      await audit(request, 'route_released', 'route', id, null, request.auth.id);
      return campaignId;
    });
  });

  app.post('/routes/:id/withdraw', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    return handle(reply, async () => {
      const campaignId = await routeCampaign(id);
      await withdrawRoute(id);
      await audit(request, 'route_withdrawn', 'route', id, null, request.auth.id);
      return campaignId;
    });
  });

  app.get('/routes/:id/sheet.pdf', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const locale = resolveLocale(request.cookies[LOCALE_COOKIE], request.headers['accept-language']);
    const pdf = await routeSheetsPdf([id], locale);
    if (!pdf) return reply.status(409).send({ error: 'not_released' });
    const route = await prisma.route.findUniqueOrThrow({ where: { id }, select: { name: true } });
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', pdfDisposition(`Routenblatt-${route.name}.pdf`))
      .header('Cache-Control', 'no-store')
      .send(pdf);
  });

  /** All handed-over routes of a campaign in one PDF, for printing at once. */
  app.get('/campaigns/:id/sheets.pdf', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const routes = await prisma.route.findMany({ where: { campaignId: id, releasedAt: { not: null } }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    const locale = resolveLocale(request.cookies[LOCALE_COOKIE], request.headers['accept-language']);
    const pdf = await routeSheetsPdf(routes.map((r) => r.id), locale);
    if (!pdf) return reply.status(409).send({ error: 'not_released' });
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', pdfDisposition('Routenblaetter.pdf')).header('Cache-Control', 'no-store').send(pdf);
  });
}

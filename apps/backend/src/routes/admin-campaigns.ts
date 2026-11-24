import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  CampaignInputSchema,
  CampaignStatusSchema,
  ProductInputSchema,
  ReorderSchema,
  SizeInputSchema,
  shiftYear,
  slugify,
  type CampaignInput,
} from '@zopf/shared';
import { prisma } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { loadAdminCampaign, toSummary } from '../lib/campaigns.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });

/** A slug that no other campaign has yet ("zopfaktion-2027", "zopfaktion-2027-2", ...). */
async function uniqueSlug(name: string, exceptId?: number): Promise<string> {
  const base = slugify(name);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await prisma.campaign.findFirst({ where: { slug, ...(exceptId && { id: { not: exceptId } }) }, select: { id: true } });
    if (!taken) return slug;
  }
}

function campaignData(input: CampaignInput) {
  return {
    name: input.name,
    deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`),
    deliveryTimeText: input.deliveryTimeText,
    orderDeadline: new Date(input.orderDeadline),
    infoDe: input.infoDe,
    infoEn: input.infoEn,
    purposeDe: input.purposeDe,
    purposeEn: input.purposeEn,
    invoiceDueDays: input.invoiceDueDays,
    zipCodes: [...new Set(input.zipCodes)].sort(),
    orderPrefix: input.orderPrefix,
    depotLat: input.depotLat ?? null,
    depotLng: input.depotLng ?? null,
  };
}

const conflict = (reply: FastifyReply, error: string) => reply.status(409).send({ error });
const notFound = (reply: FastifyReply) => reply.status(404).send({ error: 'not_found' });

/** Sends the whole campaign back after a change, so the admin page simply replaces its state. */
async function sendCampaign(reply: FastifyReply, campaignId: number) {
  const campaign = await loadAdminCampaign(campaignId);
  return campaign ? reply.send(campaign) : notFound(reply);
}

export async function adminCampaignRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // ---------------------------------------------------------------- campaigns

  app.get('/campaigns', async () => {
    const campaigns = await prisma.campaign.findMany({
      orderBy: [{ deliveryDate: 'desc' }, { id: 'desc' }],
      include: { _count: { select: { orders: true } } },
    });
    return campaigns.map((c) => toSummary(c, c._count.orders));
  });

  app.post('/campaigns', { schema: { body: CampaignInputSchema } }, async (request, reply) => {
    const input = CampaignInputSchema.parse(request.body);
    if (await prisma.campaign.findFirst({ where: { orderPrefix: input.orderPrefix } })) return conflict(reply, 'prefix_taken');
    const created = await prisma.campaign.create({ data: { ...campaignData(input), slug: await uniqueSlug(input.name) } });
    await audit(request, 'campaign_created', 'campaign', created.id, { name: created.name }, request.auth.id);
    return sendCampaign(reply.status(201), created.id);
  });

  app.get('/campaigns/:id', { schema: { params: IdParams } }, async (request, reply) => {
    return sendCampaign(reply, IdParams.parse(request.params).id);
  });

  app.put('/campaigns/:id', { schema: { params: IdParams, body: CampaignInputSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const input = CampaignInputSchema.parse(request.body);
    const current = await prisma.campaign.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } });
    if (!current) return notFound(reply);
    if (input.orderPrefix !== current.orderPrefix) {
      // Numbers already handed out must stay the same (invoices, payments).
      if (current._count.orders > 0) return conflict(reply, 'prefix_locked');
      if (await prisma.campaign.findFirst({ where: { orderPrefix: input.orderPrefix, id: { not: id } } })) return conflict(reply, 'prefix_taken');
    }
    // The public link keeps its slug once the campaign is open.
    const slug = current.status === 'DRAFT' && input.name !== current.name ? await uniqueSlug(input.name, id) : current.slug;
    await prisma.campaign.update({ where: { id }, data: { ...campaignData(input), slug } });
    await audit(request, 'campaign_updated', 'campaign', id, null, request.auth.id);
    return sendCampaign(reply, id);
  });

  /**
   * Only one campaign is open at a time, and only one with something to order.
   * Archived campaigns stay archived (they are kept for the numbers).
   */
  app.put('/campaigns/:id/status', { schema: { params: IdParams, body: CampaignStatusSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const { status } = CampaignStatusSchema.parse(request.body);
    const current = await prisma.campaign.findUnique({ where: { id } });
    if (!current) return notFound(reply);
    if (status === 'OPEN') {
      const other = await prisma.campaign.findFirst({ where: { status: 'OPEN', id: { not: id } }, select: { name: true } });
      if (other) return reply.status(409).send({ error: 'another_open', name: other.name });
      const orderable = await prisma.productSize.count({ where: { isActive: true, product: { campaignId: id, isActive: true } } });
      if (orderable === 0) return conflict(reply, 'no_products');
    }
    await prisma.campaign.update({ where: { id }, data: { status } });
    await audit(request, 'campaign_status', 'campaign', id, { from: current.status, to: status }, request.auth.id);
    return sendCampaign(reply, id);
  });

  /** A new draft from an old campaign: texts, area, products and prices, dates a year later. */
  app.post('/campaigns/:id/copy', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const source = await prisma.campaign.findUnique({
      where: { id },
      include: { products: { include: { sizes: true } } },
    });
    if (!source) return notFound(reply);

    const deliveryDay = shiftYear(source.deliveryDate.toISOString().slice(0, 10));
    const year = deliveryDay.slice(0, 4);
    const name = source.name.includes(String(Number(year) - 1)) ? source.name.replace(String(Number(year) - 1), year) : `${source.name} ${year}`;
    let prefix = source.orderPrefix.includes(String(Number(year) - 1)) ? source.orderPrefix.replace(String(Number(year) - 1), year) : `${source.orderPrefix}-${year}`;
    for (let n = 2; await prisma.campaign.findFirst({ where: { orderPrefix: prefix } }); n++) prefix = `${prefix.replace(/-\d+$/, '')}-${n}`;

    const deadlineShift = source.deliveryDate.getTime() - source.orderDeadline.getTime();
    const copy = await prisma.campaign.create({
      data: {
        slug: await uniqueSlug(name),
        name,
        status: 'DRAFT',
        deliveryDate: new Date(`${deliveryDay}T00:00:00.000Z`),
        deliveryTimeText: source.deliveryTimeText,
        orderDeadline: new Date(new Date(`${deliveryDay}T00:00:00.000Z`).getTime() - deadlineShift),
        infoDe: source.infoDe,
        infoEn: source.infoEn,
        purposeDe: source.purposeDe,
        purposeEn: source.purposeEn,
        invoiceDueDays: source.invoiceDueDays,
        zipCodes: source.zipCodes,
        depotLat: source.depotLat,
        depotLng: source.depotLng,
        orderPrefix: prefix.slice(0, 20),
        products: {
          create: source.products.map((p) => ({
            nameDe: p.nameDe,
            nameEn: p.nameEn,
            descriptionDe: p.descriptionDe,
            descriptionEn: p.descriptionEn,
            sortOrder: p.sortOrder,
            isActive: p.isActive,
            sizes: {
              create: p.sizes.map((s) => ({ labelDe: s.labelDe, labelEn: s.labelEn, priceRappen: s.priceRappen, sortOrder: s.sortOrder, isActive: s.isActive })),
            },
          })),
        },
      },
    });
    await audit(request, 'campaign_copied', 'campaign', copy.id, { from: id }, request.auth.id);
    return sendCampaign(reply.status(201), copy.id);
  });

  app.delete('/campaigns/:id', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const current = await prisma.campaign.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } });
    if (!current) return notFound(reply);
    if (current._count.orders > 0) return conflict(reply, 'has_orders');
    await prisma.campaign.delete({ where: { id } });
    await audit(request, 'campaign_deleted', 'campaign', id, { name: current.name }, request.auth.id);
    return { success: true };
  });

  // ---------------------------------------------------------------- products

  app.post('/campaigns/:id/products', { schema: { params: IdParams, body: ProductInputSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const input = ProductInputSchema.parse(request.body);
    if (!(await prisma.campaign.findUnique({ where: { id }, select: { id: true } }))) return notFound(reply);
    const last = await prisma.product.aggregate({ where: { campaignId: id }, _max: { sortOrder: true } });
    await prisma.product.create({ data: { ...input, campaignId: id, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    return sendCampaign(reply.status(201), id);
  });

  app.put('/campaigns/:id/products/order', { schema: { params: IdParams, body: ReorderSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const { ids } = ReorderSchema.parse(request.body);
    await prisma.$transaction(ids.map((productId, index) => prisma.product.updateMany({ where: { id: productId, campaignId: id }, data: { sortOrder: index } })));
    return sendCampaign(reply, id);
  });

  app.put('/products/:id', { schema: { params: IdParams, body: ProductInputSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const input = ProductInputSchema.parse(request.body);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return notFound(reply);
    await prisma.product.update({ where: { id }, data: input });
    return sendCampaign(reply, product.campaignId);
  });

  app.delete('/products/:id', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return notFound(reply);
    if ((await prisma.orderItem.count({ where: { productSize: { productId: id } } })) > 0) return conflict(reply, 'in_use');
    await prisma.product.delete({ where: { id } });
    return sendCampaign(reply, product.campaignId);
  });

  // ---------------------------------------------------------------- sizes

  app.post('/products/:id/sizes', { schema: { params: IdParams, body: SizeInputSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const input = SizeInputSchema.parse(request.body);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return notFound(reply);
    const last = await prisma.productSize.aggregate({ where: { productId: id }, _max: { sortOrder: true } });
    await prisma.productSize.create({ data: { ...input, productId: id, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    return sendCampaign(reply.status(201), product.campaignId);
  });

  app.put('/products/:id/sizes/order', { schema: { params: IdParams, body: ReorderSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const { ids } = ReorderSchema.parse(request.body);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return notFound(reply);
    await prisma.$transaction(ids.map((sizeId, index) => prisma.productSize.updateMany({ where: { id: sizeId, productId: id }, data: { sortOrder: index } })));
    return sendCampaign(reply, product.campaignId);
  });

  // A price change applies to new orders only; existing ones keep their price (order_items).
  app.put('/sizes/:id', { schema: { params: IdParams, body: SizeInputSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const input = SizeInputSchema.parse(request.body);
    const size = await prisma.productSize.findUnique({ where: { id }, include: { product: true } });
    if (!size) return notFound(reply);
    await prisma.productSize.update({ where: { id }, data: input });
    if (size.priceRappen !== input.priceRappen) {
      await audit(request, 'price_changed', 'product_size', id, { from: size.priceRappen, to: input.priceRappen }, request.auth.id);
    }
    return sendCampaign(reply, size.product.campaignId);
  });

  app.delete('/sizes/:id', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const size = await prisma.productSize.findUnique({ where: { id }, include: { product: true, _count: { select: { orderItems: true } } } });
    if (!size) return notFound(reply);
    if (size._count.orderItems > 0) return conflict(reply, 'in_use');
    await prisma.productSize.delete({ where: { id } });
    return sendCampaign(reply, size.product.campaignId);
  });
}

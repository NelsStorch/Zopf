import type { AdminCampaign, AdminCampaignSummary, PublicCampaign } from '@zopf/shared';
import { prisma } from './prisma.js';
import { renderMarkdown } from './markdown.js';
import { config } from './config.js';

/** A campaign with its products and sizes in display order, as the admin needs it. */
export async function loadAdminCampaign(id: number): Promise<AdminCampaign | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      products: {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: {
          sizes: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { _count: { select: { orderItems: true } } } },
        },
      },
      depots: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      _count: { select: { orders: true } },
    },
  });
  if (!campaign) return null;
  return {
    ...toSummary(campaign, campaign._count.orders),
    deliveryTimeText: campaign.deliveryTimeText,
    infoDe: campaign.infoDe,
    infoEn: campaign.infoEn,
    purposeDe: campaign.purposeDe,
    purposeEn: campaign.purposeEn,
    invoiceDueDays: campaign.invoiceDueDays,
    zipCodes: campaign.zipCodes,
    orderPrefix: campaign.orderPrefix,
    depots: campaign.depots.map((d) => ({
      id: d.id,
      name: d.name,
      street: d.street,
      houseNumber: d.houseNumber,
      zip: d.zip,
      city: d.city,
      lat: d.lat,
      lng: d.lng,
    })),
    products: campaign.products.map((p) => ({
      id: p.id,
      nameDe: p.nameDe,
      nameEn: p.nameEn,
      descriptionDe: p.descriptionDe,
      descriptionEn: p.descriptionEn,
      sortOrder: p.sortOrder,
      isActive: p.isActive,
      sizes: p.sizes.map((s) => ({
        id: s.id,
        labelDe: s.labelDe,
        labelEn: s.labelEn,
        priceRappen: s.priceRappen,
        sortOrder: s.sortOrder,
        isActive: s.isActive,
        inUse: s._count.orderItems > 0,
      })),
    })),
  };
}

export function toSummary(
  c: { id: number; slug: string; name: string; status: AdminCampaignSummary['status']; deliveryDate: Date; orderDeadline: Date },
  orderCount: number
): AdminCampaignSummary {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    status: c.status,
    deliveryDate: c.deliveryDate.toISOString().slice(0, 10),
    orderDeadline: c.orderDeadline.toISOString(),
    orderCount,
  };
}

/**
 * The campaign the public pages show: the open one, otherwise the latest closed
 * one (so the page still says when delivery is), otherwise none. Texts and names
 * in the visitor's language, German where no translation exists.
 */
export async function loadPublicCampaign(locale: 'de' | 'en'): Promise<PublicCampaign | null> {
  const include = {
    products: {
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
      include: { sizes: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] } },
    },
  };
  const campaign =
    (await prisma.campaign.findFirst({ where: { status: 'OPEN' }, orderBy: { deliveryDate: 'desc' }, include })) ??
    (await prisma.campaign.findFirst({ where: { status: 'CLOSED' }, orderBy: { deliveryDate: 'desc' }, include }));
  if (!campaign) return null;
  const en = locale === 'en';
  return {
    slug: campaign.slug,
    name: campaign.name,
    status: campaign.status,
    deliveryDate: campaign.deliveryDate.toISOString().slice(0, 10),
    deliveryTimeText: campaign.deliveryTimeText,
    orderDeadline: campaign.orderDeadline.toISOString(),
    infoHtml: renderMarkdown((en ? campaign.infoEn : null) ?? campaign.infoDe),
    purposeHtml: renderMarkdown((en ? campaign.purposeEn : null) ?? campaign.purposeDe),
    qrInvoiceAvailable: config.bankAccount !== null,
    zipCodes: campaign.zipCodes,
    products: campaign.products
      .filter((p) => p.sizes.length > 0)
      .map((p) => ({
        id: p.id,
        name: (en ? p.nameEn : null) ?? p.nameDe,
        description: (en ? p.descriptionEn : null) ?? p.descriptionDe,
        sizes: p.sizes.map((s) => ({ id: s.id, label: (en ? s.labelEn : null) ?? s.labelDe, priceRappen: s.priceRappen })),
      })),
  };
}

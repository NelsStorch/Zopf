import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isLocale, type PublicCampaign } from '@zopf/shared';
import { prisma } from '../lib/prisma.js';

const CampaignQuery = z.object({ locale: z.string().optional() });

export async function publicRoutes(app: FastifyInstance) {
  /**
   * The campaign the start page shows: the open one, otherwise the latest closed
   * one (so the page still says when delivery is), otherwise none.
   */
  app.get('/campaign', { schema: { querystring: CampaignQuery } }, async (request): Promise<{ campaign: PublicCampaign | null }> => {
    const { locale } = CampaignQuery.parse(request.query);
    const en = isLocale(locale) && locale === 'en';
    const campaign =
      (await prisma.campaign.findFirst({ where: { status: 'OPEN' }, orderBy: { deliveryDate: 'desc' } })) ??
      (await prisma.campaign.findFirst({ where: { status: 'CLOSED' }, orderBy: { deliveryDate: 'desc' } }));
    if (!campaign) return { campaign: null };
    return {
      campaign: {
        slug: campaign.slug,
        name: campaign.name,
        status: campaign.status,
        deliveryDate: campaign.deliveryDate.toISOString(),
        deliveryTimeText: campaign.deliveryTimeText,
        orderDeadline: campaign.orderDeadline.toISOString(),
        info: (en ? campaign.infoEn : null) ?? campaign.infoDe,
        purpose: (en ? campaign.purposeEn : null) ?? campaign.purposeDe,
      },
    };
  });
}

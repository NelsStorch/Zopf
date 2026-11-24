import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PublicCampaign } from '@zopf/shared';
import { loadPublicCampaign } from '../lib/campaigns.js';

const CampaignQuery = z.object({ locale: z.string().optional() });

export async function publicRoutes(app: FastifyInstance) {
  app.get('/campaign', { schema: { querystring: CampaignQuery } }, async (request): Promise<{ campaign: PublicCampaign | null }> => {
    const { locale } = CampaignQuery.parse(request.query);
    return { campaign: await loadPublicCampaign(locale === 'en' ? 'en' : 'de') };
  });
}

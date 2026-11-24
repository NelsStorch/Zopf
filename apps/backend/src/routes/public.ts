import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AddressSuggestion, PublicCampaign } from '@zopf/shared';
import { prisma } from '../lib/prisma.js';
import { loadPublicCampaign } from '../lib/campaigns.js';
import { searchAddresses } from '../lib/addresses.js';
import { rateLimiter } from '../lib/rate-limit.js';

const CampaignQuery = z.object({ locale: z.string().optional() });
const AddressQuery = z.object({ q: z.string().max(80) });

// Typing in the address field asks a few times per second at most (debounced in the browser).
const searchLimit = rateLimiter(120, 60_000);

export async function publicRoutes(app: FastifyInstance) {
  app.get('/campaign', { schema: { querystring: CampaignQuery } }, async (request): Promise<{ campaign: PublicCampaign | null }> => {
    const { locale } = CampaignQuery.parse(request.query);
    return { campaign: await loadPublicCampaign(locale === 'en' ? 'en' : 'de') };
  });

  /** Address suggestions within the delivery area of the open campaign. */
  app.get('/addresses', { schema: { querystring: AddressQuery } }, async (request, reply): Promise<AddressSuggestion[]> => {
    if (!searchLimit(request.ip)) return reply.status(429).send({ error: 'rate_limited' });
    const { q } = AddressQuery.parse(request.query);
    const campaign = await prisma.campaign.findFirst({ where: { status: 'OPEN' }, select: { zipCodes: true } });
    if (!campaign) return [];
    return searchAddresses(q, campaign.zipCodes);
  });
}

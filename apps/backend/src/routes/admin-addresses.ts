import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AddressImportSchema, type AddressImportStatus } from '@zopf/shared';
import { prisma } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { importState, startAddressImport } from '../lib/address-import.js';
import { searchAddresses } from '../lib/addresses.js';

const SearchQuery = z.object({ q: z.string().max(80), zip: z.string().optional() });

export async function adminAddressRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/addresses/status', async (): Promise<AddressImportStatus> => {
    const [last, counts] = await Promise.all([
      prisma.addressImport.findFirst({ orderBy: { id: 'desc' } }),
      prisma.address.groupBy({ by: ['zip'], _count: { _all: true }, orderBy: { zip: 'asc' } }),
    ]);
    const { running, phase } = importState();
    return {
      running,
      phase,
      last: last && {
        id: last.id,
        zipCodes: last.zipCodes,
        startedAt: last.startedAt.toISOString(),
        finishedAt: last.finishedAt?.toISOString() ?? null,
        imported: last.imported,
        removed: last.removed,
        error: last.error,
      },
      counts: counts.map((c) => ({ zip: c.zip, count: c._count._all })),
    };
  });

  app.post('/addresses/import', { schema: { body: AddressImportSchema } }, async (request, reply) => {
    const { zipCodes } = AddressImportSchema.parse(request.body);
    const id = await startAddressImport(zipCodes, request.auth.id, request.log);
    if (id === null) return reply.status(409).send({ error: 'import_running' });
    await audit(request, 'address_import', 'address_import', id, { zipCodes }, request.auth.id);
    return reply.status(202).send({ id });
  });

  /** Same search as when ordering, for trying it out in the admin (any imported postal code). */
  app.get('/addresses/search', { schema: { querystring: SearchQuery } }, async (request) => {
    const { q } = SearchQuery.parse(request.query);
    const zips = (await prisma.address.findMany({ distinct: ['zip'], select: { zip: true } })).map((a) => a.zip);
    return searchAddresses(q, zips);
  });
}

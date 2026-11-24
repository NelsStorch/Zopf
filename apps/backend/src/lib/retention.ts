import type { FastifyBaseLogger } from 'fastify';
import { prisma } from './prisma.js';
import { config } from './config.js';

/**
 * Keeps what the privacy notice promises (apps/web/src/app/datenschutz/page.tsx):
 * - personal data of orders goes PERSONAL_DATA_RETENTION_MONTHS after the delivery
 *   day; amounts, quantities and postal code stay for the accounts
 * - mails that never went out leave the outbox after 14 days
 * - IP addresses in the audit log after 90 days
 * Runs a minute after start and then daily.
 */
export async function applyRetention(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - config.retentionMonths);

  const anonymized = await prisma.order.updateMany({
    where: { anonymizedAt: null, campaign: { deliveryDate: { lt: cutoff } } },
    data: {
      customerName: '–',
      email: '',
      phone: null,
      notes: null,
      deliveryNote: null,
      street: '',
      houseNumber: '',
      addressId: null,
      lat: null,
      lng: null,
      confirmTokenHash: null,
      accessTokenHash: null,
      anonymizedAt: now,
    },
  });
  const outbox = await prisma.outboxMail.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 14 * 86_400_000) } } });
  const ips = await prisma.auditLog.updateMany({ where: { ip: { not: null }, createdAt: { lt: new Date(now.getTime() - 90 * 86_400_000) } }, data: { ip: null } });
  return { anonymized: anonymized.count, outbox: outbox.count, ips: ips.count };
}

export function scheduleRetention(log: FastifyBaseLogger) {
  const run = () =>
    applyRetention()
      .then((result) => {
        if (result.anonymized || result.outbox || result.ips) log.info(result, 'Datenschutz: Aufbewahrung angewendet');
      })
      .catch((err) => log.error({ err }, 'Aufbewahrung fehlgeschlagen'));
  setTimeout(run, 60_000).unref();
  setInterval(run, 86_400_000).unref();
}

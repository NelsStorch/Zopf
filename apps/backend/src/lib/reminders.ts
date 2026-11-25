import type { FastifyBaseLogger } from 'fastify';
import type { Locale, ReminderStatus } from '@zopf/shared';
import { prisma } from './prisma.js';
import { config } from './config.js';
import { sendMail } from './mail.js';
import { reminderMail } from './mail-templates.js';
import { hashToken, newToken } from './tokens.js';

/**
 * "Remind me before the next campaign": everyone who ticked it with an order
 * and confirmed that order (which proves the address) gets exactly one mail per
 * campaign. 90 days after it, the contact is deleted (retention.ts): the consent
 * was for one reminder. Whoever orders again and ticks the box is back on the list.
 */

export class ReminderError extends Error {
  constructor(
    public code: string,
    public status = 409
  ) {
    super(code);
  }
}

const unsubscribeUrl = (token: string) => `${config.publicUrl}/abmelden/${token}`;
const orderUrl = () => `${config.publicUrl}/bestellen`;

const running = new Map<number, { sent: number; failed: number }>();
const done = new Map<number, { sent: number; failed: number }>();

async function openCampaign(campaignId: number) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new ReminderError('not_found', 404);
  if (campaign.status !== 'OPEN') throw new ReminderError('campaign_closed');
  // Advertising mail without the sender's postal address is not allowed.
  if (!config.brand.postalAddress) throw new ReminderError('no_postal_address');
  return campaign;
}

export async function reminderStatus(campaignId: number): Promise<ReminderStatus> {
  const [contacts, reminded] = await Promise.all([
    prisma.reminderContact.count({ where: { confirmedAt: { not: null } } }),
    prisma.reminderContact.count({ where: { confirmedAt: { not: null }, remindedCampaignId: campaignId } }),
  ]);
  const progress = running.get(campaignId) ?? done.get(campaignId) ?? { sent: 0, failed: 0 };
  return { contacts, reminded, pending: contacts - reminded, running: running.has(campaignId), ...progress };
}

/** The mail as the contacts get it (unsubscribe link without a real token). */
export async function reminderPreview(campaignId: number, locale: Locale) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new ReminderError('not_found', 404);
  return reminderMail('', locale, campaign, { order: orderUrl(), unsubscribe: unsubscribeUrl('vorschau') });
}

export async function sendReminderTest(campaignId: number, to: string, locale: Locale, log: FastifyBaseLogger) {
  const campaign = await openCampaign(campaignId);
  const mail = reminderMail(to, locale, campaign, { order: orderUrl(), unsubscribe: unsubscribeUrl('testmail') });
  await sendMail({ ...mail, subject: `[Test] ${mail.subject}` }, log);
}

/**
 * Sends the reminder to everyone not yet reminded for this campaign, in the
 * background and with a pause between mails (MAIL_PACING_MS, default 1.5 s), so the
 * mail server does not take the club for a spammer. Each mail gets a fresh
 * unsubscribe link (only its hash is stored).
 */
export async function startReminderRun(campaignId: number, log: FastifyBaseLogger): Promise<number> {
  const campaign = await openCampaign(campaignId);
  if (running.has(campaignId)) throw new ReminderError('reminder_running');
  const contacts = await prisma.reminderContact.findMany({
    where: { confirmedAt: { not: null }, OR: [{ remindedCampaignId: null }, { remindedCampaignId: { not: campaignId } }] },
    orderBy: { id: 'asc' },
  });
  const progress = { sent: 0, failed: 0 };
  running.set(campaignId, progress);
  done.delete(campaignId);
  const pause = Number(process.env.MAIL_PACING_MS) || 1500;

  void (async () => {
    for (const contact of contacts) {
      try {
        const unsubscribe = newToken();
        await prisma.reminderContact.update({ where: { id: contact.id }, data: { unsubscribeTokenHash: unsubscribe.hash } });
        const locale: Locale = contact.locale === 'en' ? 'en' : 'de';
        await sendMail(reminderMail(contact.email, locale, campaign, { order: orderUrl(), unsubscribe: unsubscribeUrl(unsubscribe.token) }), log);
        await prisma.reminderContact.update({ where: { id: contact.id }, data: { remindedCampaignId: campaignId, lastRemindedAt: new Date() } });
        progress.sent++;
      } catch (err) {
        progress.failed++;
        log.warn({ err: (err as Error).message }, 'Erinnerung nicht gesendet');
      }
      await new Promise((r) => setTimeout(r, pause));
    }
    running.delete(campaignId);
    done.set(campaignId, progress);
    log.info({ campaignId, ...progress }, 'Erinnerungen versendet');
  })();
  return contacts.length;
}

/** Unsubscribe link: deletes the contact. Unknown tokens are fine too (already gone). */
export async function unsubscribe(token: string): Promise<void> {
  await prisma.reminderContact.deleteMany({ where: { unsubscribeTokenHash: hashToken(token) } });
}

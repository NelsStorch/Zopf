import nodemailer, { type Transporter } from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

/**
 * Sending mail over the club's SMTP server (SMTP_* in .env). A mail the server
 * does not take is kept in outbox_mails and tried again after 5 and 15 minutes,
 * 1, 4 and 12 hours (same as in the Cevi shop), so an order never fails because
 * the mail server hiccups. Without SMTP_HOST mails are only written to the log
 * (local development); in production that is a warning.
 */

export interface MailAttachment {
  filename: string;
  /** Base64 in the outbox, Buffer when sending. */
  content: Buffer;
  contentType: string;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
}

const env = (name: string) => process.env[name]?.trim() || '';

let transporter: Transporter | null | undefined;

function transport(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = env('SMTP_HOST');
  if (!host) {
    transporter = null;
    return null;
  }
  const port = Number(env('SMTP_PORT') || 465);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: env('SMTP_SECURE') ? env('SMTP_SECURE') === 'true' : port === 465,
    auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined,
    tls: { rejectUnauthorized: true },
  });
  return transporter;
}

/** "[DEV] …" on the test installation, so nobody mistakes a test mail for a real one. */
export function withEnvLabel(subject: string): string {
  const label = env('MAIL_ENV_LABEL');
  return label ? `[${label}] ${subject}` : subject;
}

async function deliver(mail: Mail, log: FastifyBaseLogger): Promise<void> {
  const t = transport();
  if (!t) {
    // Local and test installations (MAIL_ENV_LABEL set) write the mail to the log, so the flow
    // can be tried without a mail server; the text holds the links. Production only warns.
    if (process.env.NODE_ENV === 'production' && !env('MAIL_ENV_LABEL')) log.warn({ subject: mail.subject }, 'SMTP_HOST fehlt, Mail nicht versendet');
    else log.info({ to: mail.to, subject: mail.subject, text: mail.text }, 'Mail (nicht versendet, kein SMTP_HOST)');
    return;
  }
  await t.sendMail({
    from: env('SMTP_FROM') || env('SMTP_USER'),
    replyTo: env('CONTACT_EMAIL') || undefined,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: mail.attachments,
  });
}

/** Sends now; if that fails, the mail goes to the outbox. Never throws. Returns false when queued. */
export async function sendMail(mail: Mail, log: FastifyBaseLogger): Promise<boolean> {
  const prepared = { ...mail, subject: withEnvLabel(mail.subject) };
  try {
    await deliver(prepared, log);
    return true;
  } catch (err) {
    log.warn({ err: (err as Error).message, subject: prepared.subject }, 'Mail nicht angenommen, kommt in den Postausgang');
    await prisma.outboxMail.create({
      data: {
        payload: {
          ...prepared,
          attachments: (prepared.attachments ?? []).map((a) => ({ ...a, content: a.content.toString('base64') })),
        } as unknown as Prisma.InputJsonValue,
        attempts: 1,
        lastError: (err as Error).message.slice(0, 500),
        nextAttempt: new Date(Date.now() + RETRY_MINUTES[0] * 60_000),
      },
    });
    return false;
  }
}

/** Minutes until the next try after the 1st, 2nd, ... failure. After the last one the mail stays as failed. */
export const RETRY_MINUTES = [5, 15, 60, 240, 720];

async function retryOutbox(log: FastifyBaseLogger) {
  const due = await prisma.outboxMail.findMany({
    where: { nextAttempt: { lte: new Date() }, attempts: { lte: RETRY_MINUTES.length } },
    take: 20,
    orderBy: { nextAttempt: 'asc' },
  });
  for (const entry of due) {
    const payload = entry.payload as unknown as Omit<Mail, 'attachments'> & { attachments: { filename: string; content: string; contentType: string }[] };
    try {
      await deliver({ ...payload, attachments: payload.attachments.map((a) => ({ ...a, content: Buffer.from(a.content, 'base64') })) }, log);
      await prisma.outboxMail.delete({ where: { id: entry.id } });
      log.info({ subject: payload.subject }, 'Mail aus dem Postausgang versendet');
    } catch (err) {
      const delay = RETRY_MINUTES[entry.attempts];
      await prisma.outboxMail.update({
        where: { id: entry.id },
        data: {
          attempts: entry.attempts + 1,
          lastError: (err as Error).message.slice(0, 500),
          // After the last try it is never due again; the retention removes it after 14 days.
          nextAttempt: delay ? new Date(Date.now() + delay * 60_000) : new Date('9999-12-31'),
        },
      });
    }
  }
}

export function scheduleOutbox(log: FastifyBaseLogger) {
  const timer = setInterval(() => retryOutbox(log).catch((err) => log.error({ err }, 'Postausgang fehlgeschlagen')), 60_000);
  timer.unref();
}

/** Text for HTML: every value that comes from a customer or the admin goes through this. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

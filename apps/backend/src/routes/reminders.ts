import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { LOCALE_COOKIE, resolveLocale, TestMailSchema, UnsubscribeSchema } from '@zopf/shared';
import { audit } from '../lib/audit.js';
import { rateLimiter } from '../lib/rate-limit.js';
import { ReminderError, reminderPreview, reminderStatus, sendReminderTest, startReminderRun, unsubscribe } from '../lib/reminders.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });

async function handle<T>(reply: FastifyReply, work: () => Promise<T>) {
  try {
    return reply.send(await work());
  } catch (err) {
    if (err instanceof ReminderError) return reply.status(err.status).send({ error: err.code });
    throw err;
  }
}

export async function adminReminderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/campaigns/:id/reminders', { schema: { params: IdParams } }, async (request) => reminderStatus(IdParams.parse(request.params).id));

  /** The mail as HTML for the preview frame; locked down, it is shown inside the admin. */
  app.get('/campaigns/:id/reminders/preview', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const locale = resolveLocale(request.cookies[LOCALE_COOKIE], request.headers['accept-language']);
    try {
      const mail = await reminderPreview(id, locale);
      return reply
        .header('Content-Type', 'text/html; charset=utf-8')
        .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'")
        .header('X-Frame-Options', 'SAMEORIGIN')
        .send(mail.html);
    } catch (err) {
      if (err instanceof ReminderError) return reply.status(err.status).send({ error: err.code });
      throw err;
    }
  });

  app.post('/campaigns/:id/reminders/test', { schema: { params: IdParams, body: TestMailSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const { email, locale } = TestMailSchema.parse(request.body);
    return handle(reply, async () => {
      await sendReminderTest(id, email, locale, request.log);
      return { success: true };
    });
  });

  app.post('/campaigns/:id/reminders/send', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    return handle(reply, async () => {
      const count = await startReminderRun(id, request.log);
      await audit(request, 'reminders_sent', 'campaign', id, { count }, request.auth.id);
      return reminderStatus(id);
    });
  });
}

const unsubscribeLimit = rateLimiter(30, 60_000);

export async function publicReminderRoutes(app: FastifyInstance) {
  // POST, not GET: mail scanners open links, but do not press buttons.
  app.post('/reminders/unsubscribe', { schema: { body: UnsubscribeSchema } }, async (request, reply) => {
    if (!unsubscribeLimit(request.ip)) return reply.status(429).send({ error: 'rate_limited' });
    await unsubscribe(UnsubscribeSchema.parse(request.body).token);
    return { success: true };
  });
}

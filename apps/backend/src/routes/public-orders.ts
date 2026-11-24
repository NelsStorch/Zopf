import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { OrderChangeSchema, OrderCreateSchema, ResendLinkSchema } from '@zopf/shared';
import { cancelOrder, changeOrder, confirmOrder, createOrder, loadPublicOrder, OrderError, resendLinks } from '../lib/orders.js';
import { rateLimiter } from '../lib/rate-limit.js';

const TokenParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) });
const ConfirmBody = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) });

// Per IP: a household may order a few times, a script may not.
const createLimit = rateLimiter(10, 60 * 60_000);
const linkLimit = rateLimiter(5, 60 * 60_000);
const tokenLimit = rateLimiter(60, 60_000);

function limited(check: (key: string) => boolean, request: FastifyRequest, reply: FastifyReply) {
  if (check(request.ip)) return false;
  reply.status(429).send({ error: 'rate_limited' });
  return true;
}

async function handle(reply: FastifyReply, work: () => Promise<unknown>) {
  try {
    return reply.send(await work());
  } catch (err) {
    if (err instanceof OrderError) return reply.status(err.status).send({ error: err.code });
    throw err;
  }
}

/**
 * Ordering without an account. Free text from customers (name, address, notes)
 * only travels in these named JSON fields; see docs/betrieb.md for the WAF.
 */
export async function publicOrderRoutes(app: FastifyInstance) {
  app.post('/orders', { schema: { body: OrderCreateSchema } }, async (request, reply) => {
    if (limited(createLimit, request, reply)) return;
    const input = OrderCreateSchema.parse(request.body);
    // Bots fill in every field. Answer as if all went well, store nothing.
    if (input.website) return reply.status(202).send({ status: 'pending' });
    return handle(reply.status(202), async () => {
      await createOrder(input, request.log);
      return { status: 'pending' };
    });
  });

  // POST, not GET: mail scanners open links, but do not press buttons.
  app.post('/orders/confirm', { schema: { body: ConfirmBody } }, async (request, reply) => {
    if (limited(tokenLimit, request, reply)) return;
    const { token } = ConfirmBody.parse(request.body);
    return handle(reply, () => confirmOrder(token, request.log));
  });

  app.get('/orders/:token', { schema: { params: TokenParams } }, async (request, reply) => {
    if (limited(tokenLimit, request, reply)) return;
    const { token } = TokenParams.parse(request.params);
    return handle(reply, () => loadPublicOrder(token));
  });

  app.put('/orders/:token', { schema: { params: TokenParams, body: OrderChangeSchema } }, async (request, reply) => {
    if (limited(tokenLimit, request, reply)) return;
    const { token } = TokenParams.parse(request.params);
    const input = OrderChangeSchema.parse(request.body);
    return handle(reply, async () => {
      await changeOrder(token, input, request.log);
      return loadPublicOrder(token);
    });
  });

  app.post('/orders/:token/cancel', { schema: { params: TokenParams } }, async (request, reply) => {
    if (limited(tokenLimit, request, reply)) return;
    const { token } = TokenParams.parse(request.params);
    return handle(reply, async () => {
      await cancelOrder(token, request.log);
      return loadPublicOrder(token);
    });
  });

  app.post('/orders/resend-link', { schema: { body: ResendLinkSchema } }, async (request, reply) => {
    if (limited(linkLimit, request, reply)) return;
    const { email, locale } = ResendLinkSchema.parse(request.body);
    await resendLinks(email, locale, request.log);
    return reply.status(202).send({ status: 'sent_if_known' });
  });
}

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { BulkPaidSchema, LOCALE_COOKIE, OrderIdsSchema, PaymentUpdateSchema, resolveLocale, type AdminOrderRow, type BakeryReport } from '@zopf/shared';
import { prisma } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { sendMail } from '../lib/mail.js';
import { cancelledMail, paymentReminderMail } from '../lib/mail-templates.js';
import { bakeryPdf, bakeryReport, ordersCsv } from '../lib/reports.js';
import { formatNumber, invoiceAttachment, invoiceData, manageUrl, orderInclude, toSummary } from '../lib/orders.js';
import { invoiceFilename, renderInvoice } from '../lib/invoice.js';
import { newToken } from '../lib/tokens.js';
import { pdfDisposition } from '../lib/pdf-response.js';

const IdParams = z.object({ id: z.coerce.number().int().positive() });
const notFound = (reply: FastifyReply) => reply.status(404).send({ error: 'not_found' });
/** Language of the admin's browser, for PDFs and exports. */
const adminLocale = (request: FastifyRequest) => resolveLocale(request.cookies[LOCALE_COOKIE], request.headers['accept-language']);
const safeName = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '-');

async function rows(where: { campaignId?: number; id?: { in: number[] } }): Promise<AdminOrderRow[]> {
  const orders = await prisma.order.findMany({
    where,
    include: {
      items: { orderBy: { id: 'asc' } },
      campaign: { select: { orderPrefix: true } },
      mailLogs: { where: { kind: 'payment_reminder' }, orderBy: { sentAt: 'desc' }, take: 1 },
    },
    orderBy: [{ number: { sort: 'desc', nulls: 'first' } }, { id: 'desc' }],
  });
  return orders.map((o) => ({
    id: o.id,
    number: formatNumber(o),
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    customerName: o.customerName,
    email: o.email,
    phone: o.phone,
    address: `${`${o.street} ${o.houseNumber}`.trim()}, ${o.zip} ${o.city}`,
    addressManual: o.addressManual,
    hasLocation: o.lat !== null && o.lng !== null,
    items: o.items.map((i) => `${i.quantity}× ${i.productName} ${i.sizeLabel}`).join(', '),
    pieces: o.items.reduce((sum, i) => sum + i.quantity, 0),
    donationRappen: o.donationRappen,
    totalRappen: o.totalRappen,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    paidVia: o.paidVia,
    paidAt: o.paidAt?.toISOString() ?? null,
    lastReminderAt: o.mailLogs[0]?.sentAt.toISOString() ?? null,
    notes: o.notes,
  }));
}

export async function adminOrderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  /** All orders of a campaign, newest first; unconfirmed ones too (they expire on their own). */
  app.get('/campaigns/:id/orders', { schema: { params: IdParams } }, async (request) => rows({ campaignId: IdParams.parse(request.params).id }));

  /** The invoice as the customer has it (paid ones say so instead of a payment slip). */
  app.get('/orders/:id/invoice', { schema: { params: IdParams } }, async (request, reply) => {
    const order = await prisma.order.findUnique({ where: { id: IdParams.parse(request.params).id }, include: orderInclude });
    if (order?.status !== 'CONFIRMED') return notFound(reply);
    const data = invoiceData(order);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', pdfDisposition(invoiceFilename(data.number, data.locale)))
      .header('Cache-Control', 'no-store')
      .send(await renderInvoice(data));
  });

  app.put('/orders/:id/payment', { schema: { params: IdParams, body: PaymentUpdateSchema } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const update = PaymentUpdateSchema.parse(request.body);
    const order = await prisma.order.findUnique({ where: { id } });
    if (order?.status !== 'CONFIRMED') return notFound(reply);
    await prisma.order.update({
      where: { id },
      data: update.status === 'PAID' ? { paymentStatus: 'PAID', paidVia: update.via, paidAt: new Date() } : { paymentStatus: 'OPEN', paidVia: null, paidAt: null },
    });
    await audit(request, update.status === 'PAID' ? 'payment_received' : 'payment_reopened', 'order', id, update.status === 'PAID' ? { via: update.via } : null, request.auth.id);
    return (await rows({ id: { in: [id] } }))[0];
  });

  /** Several orders paid at once, e.g. after going through the bank statement. Already paid ones stay as they are. */
  app.post('/orders/payments', { schema: { body: BulkPaidSchema } }, async (request) => {
    const { ids, via } = BulkPaidSchema.parse(request.body);
    const { count } = await prisma.order.updateMany({
      where: { id: { in: ids }, status: 'CONFIRMED', paymentStatus: 'OPEN' },
      data: { paymentStatus: 'PAID', paidVia: via, paidAt: new Date() },
    });
    await audit(request, 'payments_received', 'order', null, { ids, via, count }, request.auth.id);
    return { updated: count, rows: await rows({ id: { in: ids } }) };
  });

  /**
   * Payment reminders for open QR invoices, with the invoice attached again. Each
   * mail carries a fresh personal link (the old one stops working), because the
   * plain link is not stored. Orders that are paid, paid on delivery or not
   * confirmed are skipped.
   */
  app.post('/orders/reminders', { schema: { body: OrderIdsSchema } }, async (request) => {
    const { ids } = OrderIdsSchema.parse(request.body);
    const orders = await prisma.order.findMany({
      where: { id: { in: ids }, status: 'CONFIRMED', paymentStatus: 'OPEN', paymentMethod: 'QR_INVOICE', anonymizedAt: null },
      include: orderInclude,
    });
    let sent = 0;
    for (const order of orders) {
      const invoice = await invoiceAttachment(order, true);
      if (!invoice) continue;
      const access = newToken();
      await prisma.order.update({ where: { id: order.id }, data: { accessTokenHash: access.hash } });
      await sendMail(paymentReminderMail(toSummary(order), manageUrl(access.token), invoice), request.log);
      await prisma.orderMailLog.create({ data: { orderId: order.id, kind: 'payment_reminder' } });
      sent++;
    }
    await audit(request, 'payment_reminders', 'order', null, { requested: ids.length, sent }, request.auth.id);
    return { sent, skipped: ids.length - sent, rows: await rows({ id: { in: ids } }) };
  });

  // ---------------------------------------------------------------- bakery and exports

  app.get('/campaigns/:id/bakery', { schema: { params: IdParams } }, async (request, reply): Promise<BakeryReport | undefined> => {
    const report = await bakeryReport(IdParams.parse(request.params).id);
    if (!report) return notFound(reply);
    return report;
  });

  app.get('/campaigns/:id/bakery.pdf', { schema: { params: IdParams } }, async (request, reply) => {
    const report = await bakeryReport(IdParams.parse(request.params).id);
    if (!report) return notFound(reply);
    const locale = adminLocale(request);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', pdfDisposition(`${locale === 'en' ? 'Bakery' : 'Backliste'}-${safeName(report.campaign.name)}.pdf`))
      .header('Cache-Control', 'no-store')
      .send(await bakeryPdf(report, locale));
  });

  app.get('/campaigns/:id/orders.csv', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const csv = await ordersCsv(id, adminLocale(request));
    if (csv === null) return notFound(reply);
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id }, select: { name: true } });
    await audit(request, 'orders_exported', 'campaign', id, null, request.auth.id);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${safeName(campaign.name)}-Bestellungen.csv"`)
      .header('Cache-Control', 'no-store')
      .send(csv);
  });

  /** Cancelled by the team (customer called, double order). Paid orders need a refund first, so they stay. */
  app.post('/orders/:id/cancel', { schema: { params: IdParams } }, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order || order.status === 'CANCELLED') return notFound(reply);
    if (order.paymentStatus === 'PAID') return reply.status(409).send({ error: 'already_paid' });
    const cancelled = await prisma.order.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() }, include: orderInclude });
    // An unconfirmed order never got anything from us, so no mail either.
    if (order.status === 'CONFIRMED') {
      await sendMail(cancelledMail(toSummary(cancelled)), request.log);
      await prisma.orderMailLog.create({ data: { orderId: id, kind: 'cancelled' } });
    }
    await audit(request, 'order_cancelled', 'order', id, null, request.auth.id);
    return (await rows({ id: { in: [id] } }))[0];
  });
}

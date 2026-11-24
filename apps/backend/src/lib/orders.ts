import type { FastifyBaseLogger } from 'fastify';
import { Prisma } from '@prisma/client';
import { orderNumber, type Locale, type OrderAddress, type OrderChange, type OrderCreate, type PublicOrder } from '@zopf/shared';
import { prisma } from './prisma.js';
import { config } from './config.js';
import { hashToken, newToken } from './tokens.js';
import { geocodeAddress } from './geocode.js';
import { sendMail } from './mail.js';
import { cancelledMail, confirmedMail, confirmRequestMail, linkMail, type InvoiceAttachment, type OrderSummary } from './mail-templates.js';
import { invoiceFilename, renderInvoice, type InvoiceData } from './invoice.js';

/**
 * Orders from the public form. The flow:
 *   1. create: stored as PENDING_CONFIRMATION, mail with a confirmation link
 *   2. confirm: number given, personal link (view, change, cancel until the deadline)
 * Prices always come from the database; the browser only says what and how many.
 * Secret links are stored as hashes only (lib/tokens.ts).
 */

export class OrderError extends Error {
  constructor(
    public code: string,
    public status = 400
  ) {
    super(code);
  }
}

const orderInclude = { items: { orderBy: { id: 'asc' as const } }, campaign: true } satisfies Prisma.OrderInclude;
type FullOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export const confirmUrl = (token: string) => `${config.publicUrl}/bestellung/bestaetigen/${token}`;
export const manageUrl = (token: string) => `${config.publicUrl}/bestellung/${token}`;

async function openCampaign() {
  const campaign = await prisma.campaign.findFirst({ where: { status: 'OPEN' } });
  if (!campaign) throw new OrderError('campaign_closed', 409);
  if (campaign.orderDeadline <= new Date()) throw new OrderError('deadline_passed', 409);
  return campaign;
}

/** Order lines with names and prices from the database; the same size twice becomes one line. */
async function priceItems(campaignId: number, items: OrderChange['items'], locale: Locale) {
  const wanted = new Map<number, number>();
  for (const item of items) wanted.set(item.sizeId, (wanted.get(item.sizeId) ?? 0) + item.quantity);
  const sizes = await prisma.productSize.findMany({
    where: { id: { in: [...wanted.keys()] }, isActive: true, product: { campaignId, isActive: true } },
    include: { product: true },
  });
  if (sizes.length !== wanted.size) throw new OrderError('invalid_items');
  const lines = sizes
    .sort((a, b) => a.product.sortOrder - b.product.sortOrder || a.sortOrder - b.sortOrder)
    .map((s) => ({
      productSizeId: s.id,
      productName: (locale === 'en' ? s.product.nameEn : null) ?? s.product.nameDe,
      sizeLabel: (locale === 'en' ? s.labelEn : null) ?? s.labelDe,
      quantity: Math.min(wanted.get(s.id)!, 99),
      unitPriceRappen: s.priceRappen,
    }));
  const itemsRappen = lines.reduce((sum, l) => sum + l.quantity * l.unitPriceRappen, 0);
  if (itemsRappen <= 0) throw new OrderError('invalid_items');
  return { lines, itemsRappen };
}

/** The address must lie in the delivery area; a picked one comes with its coordinates. */
async function resolveAddress(zipCodes: string[], address: OrderAddress) {
  if (address.kind === 'directory') {
    const found = await prisma.address.findUnique({ where: { id: address.addressId } });
    if (!found || !zipCodes.includes(found.zip)) throw new OrderError('address_outside');
    return {
      addressId: found.id,
      street: found.street,
      houseNumber: found.houseNumber,
      zip: found.zip,
      city: found.city,
      addressManual: false,
      lat: found.lat,
      lng: found.lng,
      locationSource: 'DIRECTORY' as const,
    };
  }
  if (zipCodes.length > 0 && !zipCodes.includes(address.zip)) throw new OrderError('address_outside');
  return {
    addressId: null,
    street: address.street,
    houseNumber: address.houseNumber,
    zip: address.zip,
    city: address.city,
    addressManual: true,
    lat: null,
    lng: null,
    locationSource: 'NONE' as const,
  };
}

function paymentAllowed(method: OrderChange['paymentMethod']) {
  if (method === 'QR_INVOICE' && config.bankAccount === null) throw new OrderError('payment_unavailable');
}

/** A hand-typed address gets its pin from geo.admin.ch, in the background (the customer does not wait). */
function geocodeLater(orderId: number, address: { street: string; houseNumber: string; zip: string; city: string }, log: FastifyBaseLogger) {
  void geocodeAddress(address)
    .then(async (point) => {
      if (!point) return;
      await prisma.order.updateMany({ where: { id: orderId, locationSource: 'NONE' }, data: { lat: point.lat, lng: point.lng, locationSource: 'GEOCODED' } });
    })
    .catch((err) => log.warn({ err }, 'Geocoding fehlgeschlagen'));
}

export function formatNumber(order: { number: number | null; campaign: { orderPrefix: string } }): string | null {
  return order.number === null ? null : orderNumber(order.campaign.orderPrefix, order.number);
}

export function toSummary(order: FullOrder): OrderSummary {
  return {
    number: formatNumber(order),
    customerName: order.customerName,
    email: order.email,
    locale: order.locale === 'en' ? 'en' : 'de',
    items: order.items,
    donationRappen: order.donationRappen,
    totalRappen: order.totalRappen,
    address: { street: order.street, houseNumber: order.houseNumber, zip: order.zip, city: order.city, manual: order.addressManual },
    paymentMethod: order.paymentMethod,
    campaign: { name: order.campaign.name, deliveryDate: order.campaign.deliveryDate, orderDeadline: order.campaign.orderDeadline },
  };
}

/** Everything the invoice PDF needs. A reminder is dated today and due in ten days. */
export function invoiceData(order: FullOrder, reminder = false): InvoiceData {
  const date = reminder ? new Date() : (order.confirmedAt ?? new Date());
  const dueDate = new Date(date.getTime() + (reminder ? 10 : order.campaign.invoiceDueDays) * 86_400_000);
  return {
    orderId: order.id,
    number: formatNumber(order) ?? '',
    locale: order.locale === 'en' ? 'en' : 'de',
    date,
    dueDate,
    deliveryDate: order.campaign.deliveryDate,
    campaignName: order.campaign.name,
    customer: { name: order.customerName, street: order.street, houseNumber: order.houseNumber, zip: order.zip, city: order.city, email: order.email },
    items: order.items,
    donationRappen: order.donationRappen,
    totalRappen: order.totalRappen,
    paid: order.paymentStatus === 'PAID',
    reminder,
  };
}

/** The invoice for a mail: only for confirmed, unpaid QR orders, and only with an account configured. */
export async function invoiceAttachment(order: FullOrder, reminder = false): Promise<InvoiceAttachment | null> {
  if (order.paymentMethod !== 'QR_INVOICE' || order.paymentStatus === 'PAID' || order.status !== 'CONFIRMED' || !config.bankAccount) return null;
  const data = invoiceData(order, reminder);
  return {
    attachment: { filename: invoiceFilename(data.number, data.locale), content: await renderInvoice(data), contentType: 'application/pdf' },
    dueDate: data.dueDate,
  };
}

/** The invoice PDF from the personal page; null when this order has none. */
export async function publicInvoice(token: string): Promise<{ pdf: Buffer; filename: string } | null> {
  const order = await byAccessToken(token);
  if (order.paymentMethod !== 'QR_INVOICE' || order.status !== 'CONFIRMED') return null;
  const data = invoiceData(order);
  return { pdf: await renderInvoice(data), filename: invoiceFilename(data.number, data.locale) };
}

export { orderInclude };
export type { FullOrder };

async function logMail(orderId: number, kind: string) {
  await prisma.orderMailLog.create({ data: { orderId, kind } });
}

export async function createOrder(input: OrderCreate, log: FastifyBaseLogger): Promise<void> {
  const campaign = await openCampaign();
  paymentAllowed(input.paymentMethod);
  const { lines, itemsRappen } = await priceItems(campaign.id, input.items, input.locale);
  const address = await resolveAddress(campaign.zipCodes, input.address);
  const confirm = newToken();

  const order = await prisma.order.create({
    data: {
      campaignId: campaign.id,
      locale: input.locale,
      confirmTokenHash: confirm.hash,
      confirmExpiresAt: new Date(Date.now() + config.orderConfirmHours * 3_600_000),
      customerName: input.customerName,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
      ...address,
      paymentMethod: input.paymentMethod,
      donationRappen: input.donationRappen,
      totalRappen: itemsRappen + input.donationRappen,
      reminderOptIn: input.reminderOptIn,
      items: { create: lines },
    },
    include: orderInclude,
  });
  if (address.addressManual) geocodeLater(order.id, address, log);
  await sendMail(confirmRequestMail(toSummary(order), confirmUrl(confirm.token)), log);
  await logMail(order.id, 'confirm');
}

/**
 * The click in the confirmation mail. Gives the order its number and a personal
 * link; ticking "remind me" counts as confirmed opt-in, because this click proves
 * the address. A second click answers "already confirmed".
 */
export async function confirmOrder(token: string, log: FastifyBaseLogger): Promise<{ status: 'confirmed' | 'already'; accessToken?: string }> {
  const order = await prisma.order.findUnique({ where: { confirmTokenHash: hashToken(token) }, include: orderInclude });
  if (!order || order.status === 'CANCELLED') throw new OrderError('not_found', 404);
  if (order.status === 'CONFIRMED') return { status: 'already' };
  if (order.confirmExpiresAt && order.confirmExpiresAt < new Date()) throw new OrderError('confirm_expired', 410);

  const access = newToken();
  const confirmed = await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.update({ where: { id: order.campaignId }, data: { nextOrderNumber: { increment: 1 } } });
    return tx.order.update({
      where: { id: order.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), number: campaign.nextOrderNumber - 1, accessTokenHash: access.hash, confirmExpiresAt: null },
      include: orderInclude,
    });
  });

  if (confirmed.reminderOptIn) await setReminder(confirmed.email, confirmed.locale, true);
  const invoice = await invoiceAttachment(confirmed);
  await sendMail(confirmedMail(toSummary(confirmed), manageUrl(access.token), 'confirmed', invoice), log);
  await logMail(confirmed.id, invoice ? 'confirmation_invoice' : 'confirmation');
  return { status: 'confirmed', accessToken: access.token };
}

async function setReminder(email: string, locale: string, wanted: boolean) {
  if (!wanted) {
    await prisma.reminderContact.deleteMany({ where: { email } });
    return;
  }
  await prisma.reminderContact.upsert({
    where: { email },
    create: { email, locale, confirmedAt: new Date(), unsubscribeTokenHash: newToken().hash },
    update: { locale, confirmedAt: new Date() },
  });
}

async function byAccessToken(token: string): Promise<FullOrder> {
  const order = await prisma.order.findUnique({ where: { accessTokenHash: hashToken(token) }, include: orderInclude });
  if (!order || order.anonymizedAt) throw new OrderError('not_found', 404);
  return order;
}

const isEditable = (order: FullOrder) => order.status === 'CONFIRMED' && order.campaign.status === 'OPEN' && order.campaign.orderDeadline > new Date();

export async function loadPublicOrder(token: string): Promise<PublicOrder> {
  const order = await byAccessToken(token);
  const itemsRappen = order.items.reduce((sum, i) => sum + i.quantity * i.unitPriceRappen, 0);
  return {
    number: formatNumber(order),
    status: order.status,
    editable: isEditable(order),
    campaign: {
      name: order.campaign.name,
      deliveryDate: order.campaign.deliveryDate.toISOString().slice(0, 10),
      deliveryTimeText: order.campaign.deliveryTimeText,
      orderDeadline: order.campaign.orderDeadline.toISOString(),
    },
    items: order.items.map((i) => ({
      sizeId: i.productSizeId,
      productName: i.productName,
      sizeLabel: i.sizeLabel,
      quantity: i.quantity,
      unitPriceRappen: i.unitPriceRappen,
    })),
    itemsRappen,
    donationRappen: order.donationRappen,
    totalRappen: order.totalRappen,
    customerName: order.customerName,
    email: order.email,
    phone: order.phone,
    notes: order.notes,
    address: {
      addressId: order.addressId,
      street: order.street,
      houseNumber: order.houseNumber,
      zip: order.zip,
      city: order.city,
      manual: order.addressManual,
    },
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    reminderOptIn: order.reminderOptIn,
    locale: order.locale === 'en' ? 'en' : 'de',
  };
}

/** Change from the personal page until the deadline. Items get today's prices; a paid order keeps its payment method. */
export async function changeOrder(token: string, input: OrderChange, log: FastifyBaseLogger): Promise<void> {
  const order = await byAccessToken(token);
  if (!isEditable(order)) throw new OrderError('not_editable', 409);
  if (order.paymentStatus === 'PAID' && input.paymentMethod !== order.paymentMethod) throw new OrderError('already_paid', 409);
  paymentAllowed(input.paymentMethod);
  const { lines, itemsRappen } = await priceItems(order.campaignId, input.items, input.locale);
  const sameAddress =
    input.address.kind === 'directory'
      ? input.address.addressId === order.addressId
      : order.addressManual && input.address.street === order.street && input.address.houseNumber === order.houseNumber && input.address.zip === order.zip;
  const address = sameAddress ? null : await resolveAddress(order.campaign.zipCodes, input.address);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({ where: { orderId: order.id } });
    return tx.order.update({
      where: { id: order.id },
      data: {
        customerName: input.customerName,
        phone: input.phone,
        notes: input.notes,
        paymentMethod: input.paymentMethod,
        donationRappen: input.donationRappen,
        totalRappen: itemsRappen + input.donationRappen,
        reminderOptIn: input.reminderOptIn,
        locale: input.locale,
        ...(address ?? {}),
        items: { create: lines },
      },
      include: orderInclude,
    });
  });
  if (address?.addressManual) geocodeLater(order.id, address, log);
  if (updated.reminderOptIn !== order.reminderOptIn) await setReminder(updated.email, updated.locale, updated.reminderOptIn);
  const invoice = await invoiceAttachment(updated);
  await sendMail(confirmedMail(toSummary(updated), manageUrl(token), 'changed', invoice), log);
  await logMail(order.id, invoice ? 'changed_invoice' : 'changed');
}

export async function cancelOrder(token: string, log: FastifyBaseLogger): Promise<void> {
  const order = await byAccessToken(token);
  if (!isEditable(order)) throw new OrderError('not_editable', 409);
  if (order.paymentStatus === 'PAID') throw new OrderError('already_paid', 409);
  const cancelled = await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', cancelledAt: new Date() }, include: orderInclude });
  await sendMail(cancelledMail(toSummary(cancelled)), log);
  await logMail(order.id, 'cancelled');
}

/**
 * "I lost my link": new links for the confirmed orders of this address in the open
 * campaign, by mail. The answer is the same whether or not there are orders, so
 * nobody can find out who ordered.
 */
export async function resendLinks(email: string, locale: Locale, log: FastifyBaseLogger): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { email, status: 'CONFIRMED', campaign: { status: { in: ['OPEN', 'CLOSED'] } } },
    include: { campaign: true },
    orderBy: { id: 'asc' },
  });
  if (orders.length === 0) return;
  const links: { number: string; url: string }[] = [];
  for (const order of orders) {
    const access = newToken();
    await prisma.order.update({ where: { id: order.id }, data: { accessTokenHash: access.hash } });
    links.push({ number: formatNumber(order) ?? '', url: manageUrl(access.token) });
    await logMail(order.id, 'link');
  }
  await sendMail(linkMail(email, locale, links), log);
}

/** Unconfirmed orders past their time go away (hourly, see scheduleOrderCleanup). */
export async function deleteExpiredOrders(): Promise<number> {
  const { count } = await prisma.order.deleteMany({ where: { status: 'PENDING_CONFIRMATION', confirmExpiresAt: { lt: new Date() } } });
  return count;
}

export function scheduleOrderCleanup(log: FastifyBaseLogger) {
  const run = () =>
    deleteExpiredOrders()
      .then((n) => n > 0 && log.info({ count: n }, 'Unbestätigte Bestellungen gelöscht'))
      .catch((err) => log.error({ err }, 'Aufräumen fehlgeschlagen'));
  setTimeout(run, 60_000).unref();
  setInterval(run, 3_600_000).unref();
}

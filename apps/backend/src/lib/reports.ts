import PDFDocument from 'pdfkit';
import { formatDate, orderNumber, translator, type BakeryLine, type BakeryReport, type Locale } from '@zopf/shared';
import { prisma } from './prisma.js';
import { config } from './config.js';

type CountedItem = { productSizeId: number | null; productName: string; sizeLabel: string; quantity: number };

/** Adds order lines up per product size, in the order of the products in the admin. */
function sumLines(items: CountedItem[], order: Map<number, number>): BakeryLine[] {
  const lines = new Map<string, BakeryLine>();
  for (const item of items) {
    // Lines whose size was deleted later still count, grouped by their stored name.
    const key = item.productSizeId !== null ? `id:${item.productSizeId}` : `name:${item.productName}|${item.sizeLabel}`;
    const line = lines.get(key) ?? { sizeId: item.productSizeId, productName: item.productName, sizeLabel: item.sizeLabel, quantity: 0 };
    line.quantity += item.quantity;
    lines.set(key, line);
  }
  const rank = (l: BakeryLine) => (l.sizeId === null ? 1e9 : (order.get(l.sizeId) ?? 1e9));
  return [...lines.values()].sort((a, b) => rank(a) - rank(b) || a.productName.localeCompare(b.productName) || a.sizeLabel.localeCompare(b.sizeLabel));
}

/**
 * The bakery list: what to bake in total and what goes into which route's crates.
 * Only confirmed orders count. Sizes that still exist are named as in the admin
 * (German), whatever language the customer ordered in.
 */
export async function bakeryReport(campaignId: number): Promise<BakeryReport | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { products: { include: { sizes: true } }, routes: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
  });
  if (!campaign) return null;

  const sizeOrder = new Map<number, number>();
  const sizeNames = new Map<number, { productName: string; sizeLabel: string }>();
  for (const p of campaign.products) {
    for (const s of p.sizes) {
      sizeOrder.set(s.id, p.sortOrder * 1000 + s.sortOrder);
      sizeNames.set(s.id, { productName: p.nameDe, sizeLabel: s.labelDe });
    }
  }

  const orders = await prisma.order.findMany({ where: { campaignId, status: 'CONFIRMED' }, include: { items: true } });
  const named = (items: CountedItem[]): CountedItem[] =>
    items.map((i) => ({ ...i, ...(i.productSizeId !== null ? sizeNames.get(i.productSizeId) : undefined) }));
  const pieces = (items: { quantity: number }[]) => items.reduce((s, i) => s + i.quantity, 0);
  const allItems = orders.flatMap((o) => named(o.items));

  const byRoute = new Map<number | null, typeof orders>();
  for (const o of orders) byRoute.set(o.routeId, [...(byRoute.get(o.routeId) ?? []), o]);
  const routes = [
    ...campaign.routes.map((r) => ({ id: r.id as number | null, name: r.name as string | null, color: r.color as string | null })),
    { id: null, name: null, color: null },
  ]
    .map((r) => {
      const routeOrders = byRoute.get(r.id) ?? [];
      const items = routeOrders.flatMap((o) => named(o.items));
      return { ...r, orders: routeOrders.length, pieces: pieces(items), lines: sumLines(items, sizeOrder) };
    })
    // "Not on a route yet" only shows up when there is something in it.
    .filter((r) => r.orders > 0 || r.id !== null);

  return {
    campaign: { id: campaign.id, name: campaign.name, deliveryDate: campaign.deliveryDate.toISOString().slice(0, 10) },
    orders: orders.length,
    pieces: pieces(allItems),
    money: {
      totalRappen: orders.reduce((s, o) => s + o.totalRappen, 0),
      donationRappen: orders.reduce((s, o) => s + o.donationRappen, 0),
      openRappen: orders.filter((o) => o.paymentStatus === 'OPEN').reduce((s, o) => s + o.totalRappen, 0),
    },
    totals: sumLines(allItems, sizeOrder),
    routes,
  };
}

/** Printable bakery list (A4): totals in large type, then one block per route. */
export function bakeryPdf(report: BakeryReport, locale: Locale): Promise<Buffer> {
  const t = translator(locale);
  const brand = config.brand;
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${t('bakery.title')} ${report.campaign.name}`, Author: brand.orgName } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const width = doc.page.width - 96;
  const now = new Date().toLocaleString(locale === 'de' ? 'de-CH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Zurich' });

  doc.rect(48, 40, width * 0.6, 3).fill(brand.primary);
  doc.rect(48 + width * 0.6, 40, width * 0.4, 3).fill(brand.secondary);
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#18181b').text(`${t('bakery.title')} · ${report.campaign.name}`, 48, 56);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#71717a')
    .text(
      [
        formatDate(report.campaign.deliveryDate, locale),
        t('bakery.orders', { count: report.orders }),
        t('bakery.pieces', { count: report.pieces }),
        t('bakery.printed', { date: now }),
      ].join(' · ')
    );
  doc.moveDown(1.2);

  const table = (lines: BakeryLine[], size: number) => {
    for (const line of lines) {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const y = doc.y;
      doc.font('Helvetica').fontSize(size).fillColor('#18181b').text(`${line.productName} ${line.sizeLabel}`, 48, y, { width: width - 90 });
      doc.font('Helvetica-Bold').fontSize(size).text(String(line.quantity), 48 + width - 90, y, { width: 90, align: 'right' });
      doc
        .moveTo(48, doc.y + 3)
        .lineTo(48 + width, doc.y + 3)
        .lineWidth(0.5)
        .strokeColor('#e4e4e7')
        .stroke();
      doc.moveDown(0.5);
    }
  };

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#18181b').text(t('bakery.totals'), 48);
  doc.moveDown(0.4);
  table(report.totals, 16);

  for (const route of report.routes) {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(1);
    const title = route.name ?? t('bakery.noRoute');
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(route.color ?? '#18181b')
      .text(`${title} · ${t('bakery.orders', { count: route.orders })} · ${t('bakery.pieces', { count: route.pieces })}`, 48);
    doc.moveDown(0.3);
    table(route.lines, 11);
  }
  doc.end();
  return done;
}

/**
 * One CSV cell. Quotes when needed, and defuses values that a spreadsheet would
 * run as a formula (=, +, -, @ at the start): customer input lands here.
 */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v)) v = `'${v}`;
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** All orders of a campaign as CSV for Excel (semicolon, UTF-8 with BOM, so umlauts and Swiss settings work). */
export async function ordersCsv(campaignId: number, locale: Locale): Promise<string | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { products: { orderBy: { sortOrder: 'asc' }, include: { sizes: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!campaign) return null;
  const orders = await prisma.order.findMany({
    where: { campaignId },
    include: { items: true, route: true },
    orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
  });
  const de = locale === 'de';
  const sizes = campaign.products.flatMap((p) => p.sizes.map((s) => ({ id: s.id, label: `${p.nameDe} ${s.labelDe}` })));
  const money = (r: number) => (r / 100).toFixed(2);
  const header = de
    ? ['Nummer', 'Status', 'Name', 'E-Mail', 'Telefon', 'Strasse', 'Nr.', 'PLZ', 'Ort', 'Adresse von Hand']
    : ['Number', 'Status', 'Name', 'E-mail', 'Phone', 'Street', 'No.', 'Postal code', 'Place', 'Address by hand'];
  header.push(...sizes.map((s) => s.label));
  header.push(...(de ? ['Stück', 'Spende', 'Total', 'Zahlart', 'Bezahlt', 'Bezahlt via', 'Route', 'Bemerkung', 'Bestellt am'] : ['Pieces', 'Donation', 'Total', 'Payment', 'Paid', 'Paid via', 'Route', 'Note', 'Ordered at']));

  const rows = orders.map((o) => {
    const qty = (id: number) => o.items.filter((i) => i.productSizeId === id).reduce((s, i) => s + i.quantity, 0);
    const payment = o.paymentMethod === 'QR_INVOICE' ? (de ? 'QR-Rechnung' : 'QR invoice') : de ? 'Bei Übergabe' : 'At delivery';
    return [
      o.number === null ? '' : orderNumber(campaign.orderPrefix, o.number),
      o.status,
      o.customerName,
      o.email,
      o.phone ?? '',
      o.street,
      o.houseNumber,
      o.zip,
      o.city,
      o.addressManual ? 'x' : '',
      ...sizes.map((s) => String(qty(s.id) || '')),
      String(o.items.reduce((s, i) => s + i.quantity, 0)),
      money(o.donationRappen),
      money(o.totalRappen),
      payment,
      o.paymentStatus === 'PAID' ? 'x' : '',
      o.paidVia ?? '',
      o.route?.name ?? '',
      o.notes ?? '',
      o.createdAt.toISOString().slice(0, 16).replace('T', ' '),
    ];
  });
  return `﻿${[header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

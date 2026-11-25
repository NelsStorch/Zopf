import PDFDocument from 'pdfkit';
import { formatChf, formatDate, orderNumber, translator, type BakeryLine, type Locale } from '@zopf/shared';
import { prisma } from './prisma.js';
import { config } from './config.js';
import { drawLogo } from './invoice.js';
import { drawBrandedQr, drawPlainQr } from './qr.js';
import { linkValidUntil, routeLink } from './route-links.js';

export interface SheetStop {
  seq: number;
  number: string | null;
  customerName: string;
  address: string;
  phone: string | null;
  notes: string | null;
  items: string;
  pieces: number;
  /** Still to collect at the door; 0 = paid. */
  openRappen: number;
  paymentMethod: 'QR_INVOICE' | 'ON_DELIVERY';
}

export interface SheetData {
  route: { id: number; name: string; color: string; leaders: string | null };
  campaign: { name: string; deliveryDate: Date; deliveryTimeText: string | null };
  depot: { name: string; address: string } | null;
  link: string;
  validUntil: Date;
  stops: SheetStop[];
  load: BakeryLine[];
}

/** Everything one route sheet shows; null when the route has no link yet. */
export async function routeSheetData(routeId: number): Promise<SheetData | null> {
  const route = await prisma.route.findUnique({
    where: { id: routeId },
    include: { campaign: { include: { products: { include: { sizes: true } } } }, depot: true },
  });
  const link = route && routeLink(route);
  if (!route || !link) return null;
  const orders = await prisma.order.findMany({
    where: { routeId, status: 'CONFIRMED' },
    include: { items: true },
    orderBy: [{ routeSeq: 'asc' }, { number: 'asc' }],
  });

  // Loading list per size, named as in the admin, in product order.
  const names = new Map<number, { productName: string; sizeLabel: string; rank: number }>();
  for (const p of route.campaign.products) for (const s of p.sizes) names.set(s.id, { productName: p.nameDe, sizeLabel: s.labelDe, rank: p.sortOrder * 1000 + s.sortOrder });
  const load = new Map<string, BakeryLine & { rank: number }>();
  for (const item of orders.flatMap((o) => o.items)) {
    const known = item.productSizeId !== null ? names.get(item.productSizeId) : undefined;
    const key = item.productSizeId !== null ? `id:${item.productSizeId}` : `${item.productName}|${item.sizeLabel}`;
    const line = load.get(key) ?? {
      sizeId: item.productSizeId,
      productName: known?.productName ?? item.productName,
      sizeLabel: known?.sizeLabel ?? item.sizeLabel,
      quantity: 0,
      rank: known?.rank ?? 1e9,
    };
    line.quantity += item.quantity;
    load.set(key, line);
  }

  return {
    route: { id: route.id, name: route.name, color: route.color, leaders: route.leaders },
    campaign: { name: route.campaign.name, deliveryDate: route.campaign.deliveryDate, deliveryTimeText: route.campaign.deliveryTimeText },
    depot: route.depot ? { name: route.depot.name, address: `${`${route.depot.street} ${route.depot.houseNumber}`.trim()}, ${route.depot.zip} ${route.depot.city}` } : null,
    link,
    validUntil: linkValidUntil(route.campaign.deliveryDate),
    stops: orders.map((o, index) => ({
      seq: index + 1,
      number: o.number === null ? null : orderNumber(route.campaign.orderPrefix, o.number),
      customerName: o.customerName,
      address: `${`${o.street} ${o.houseNumber}`.trim()}, ${o.zip} ${o.city}`,
      phone: o.phone,
      notes: o.notes,
      items: o.items.map((i) => `${i.quantity}× ${i.productName} ${i.sizeLabel}`).join(', '),
      pieces: o.items.reduce((s, i) => s + i.quantity, 0),
      openRappen: o.paymentStatus === 'OPEN' ? o.totalRappen : 0,
      paymentMethod: o.paymentMethod,
    })),
    load: [...load.values()].sort((a, b) => a.rank - b.rank).map(({ rank: _rank, ...line }) => line),
  };
}

const INK = '#18181b';
const MUTED = '#71717a';
const LINE = '#e4e4e7';
const M = 40;

/**
 * Route sheet, A4, one or more pages per route: header with the QR code to the
 * route on the phone (and the TWINT code), loading list, then the stops in
 * order with boxes to tick on paper, as a fallback without phone.
 */
function drawSheet(doc: PDFKit.PDFDocument, data: SheetData, locale: Locale) {
  const t = translator(locale);
  const brand = config.brand;
  const chf = (r: number) => `CHF ${formatChf(r, locale)}`;
  const width = doc.page.width - 2 * M;
  const pieces = data.stops.reduce((s, x) => s + x.pieces, 0);
  const collect = data.stops.reduce((s, x) => s + x.openRappen, 0);
  const twint = config.twintPayload;

  /* ---- header ---- */
  doc.rect(0, 0, doc.page.width, 10).fill(data.route.color);
  drawLogo(doc, M, 26, 30);
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`${brand.appName} · ${data.campaign.name}`, M + 40, 28);
  doc.font('Helvetica-Bold').fontSize(24).fillColor(data.route.color).text(`${t('sheet.title')}: ${data.route.name}`, M + 40, 40, { width: width - 40 - 140 });

  let y = 82;
  const info = (label: string, value: string) => {
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), M, y, { characterSpacing: 0.5 });
    doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(value, M, y + 10, { width: width - 150 });
    y = doc.y + 6;
  };
  info(
    formatDate(data.campaign.deliveryDate, locale),
    [data.campaign.deliveryTimeText, t('sheet.summary', { stops: data.stops.length, pieces })].filter(Boolean).join(' · ')
  );
  if (data.depot) info(t('sheet.start'), `${data.depot.name}, ${data.depot.address}`);
  if (data.route.leaders) info(t('sheet.leaders'), data.route.leaders);
  if (collect > 0) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(t('sheet.collectTotal', { amount: chf(collect) }), M, y + 2);
    y = doc.y + 6;
  }

  /* ---- QR codes, top right ---- */
  const qrSize = 116;
  const qrX = M + width - qrSize;
  drawBrandedQr(doc, data.link, { x: qrX, y: 28, size: qrSize, primary: brand.primary, secondary: brand.secondary });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text(t('sheet.scan'), qrX - 20, 28 + qrSize + 6, { width: qrSize + 20, align: 'center' });
  doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(t('sheet.scanHint'), qrX - 20, doc.y + 1, { width: qrSize + 20, align: 'center' });
  const until = data.validUntil.toLocaleDateString(locale === 'de' ? 'de-CH' : 'en-GB', { timeZone: 'Europe/Zurich' });
  doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(t('sheet.validUntil', { date: until }), qrX - 20, doc.y + 2, { width: qrSize + 20, align: 'center' });
  let qrBottom = doc.y;
  if (twint) {
    const tw = 70;
    const tx = qrX - tw - 24;
    drawPlainQr(doc, twint, tx, 28, tw);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text(t('sheet.twint'), tx, 28 + tw + 6, { width: tw, align: 'center' });
    qrBottom = Math.max(qrBottom, doc.y);
  }
  y = Math.max(y, qrBottom) + 12;

  /* ---- loading list ---- */
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(t('sheet.load'), M, y);
  y = doc.y + 4;
  const loadText = data.load.map((l) => `${l.quantity} × ${l.productName} ${l.sizeLabel}`).join('    ');
  doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(loadText || '–', M, y, { width });
  y = doc.y + 14;

  /* ---- stops ---- */
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(t('sheet.stops'), M, y);
  y = doc.y + 6;
  const boxes = 92;
  for (const stop of data.stops) {
    const textWidth = width - 30 - boxes;
    const lines = [
      `${stop.customerName}${stop.phone ? ` · ${stop.phone}` : ''}`,
      stop.items,
      ...(stop.notes ? [`«${stop.notes}»`] : []),
    ];
    doc.font('Helvetica').fontSize(9.5);
    const height = Math.max(46, 16 + lines.reduce((h, l) => h + doc.heightOfString(l, { width: textWidth }) + 2, 0) + 14);
    if (y + height > doc.page.height - M - 20) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, 6).fill(data.route.color);
      y = M;
    }
    // Number in the route colour.
    doc.circle(M + 11, y + 11, 11).fill(data.route.color);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff').text(String(stop.seq), M, y + 6, { width: 22, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(stop.address, M + 30, y + 2, { width: textWidth });
    let ty = doc.y + 1;
    doc.font('Helvetica').fontSize(9.5).fillColor(INK);
    for (const [i, line] of lines.entries()) {
      doc.fillColor(i === 2 ? MUTED : INK).text(line, M + 30, ty, { width: textWidth });
      ty = doc.y + 1;
    }
    const payment =
      stop.openRappen === 0
        ? t('sheet.paid')
        : stop.paymentMethod === 'QR_INVOICE'
          ? `${t('sheet.qrUnpaid')}: ${chf(stop.openRappen)}`
          : t('sheet.collect', { amount: chf(stop.openRappen) });
    doc.font(stop.openRappen > 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(stop.openRappen > 0 ? INK : MUTED).text(payment, M + 30, ty + 1, { width: textWidth });

    // Boxes to tick on paper.
    const bx = M + width - boxes;
    const box = (label: string, by: number) => {
      doc.lineWidth(1).strokeColor(INK).rect(bx, by, 11, 11).stroke();
      doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(label, bx + 16, by + 1.5);
    };
    box(t('sheet.delivered'), y + 2);
    if (stop.openRappen > 0) box(t('sheet.cashed'), y + 18);

    y += height;
    doc.moveTo(M, y - 6).lineTo(M + width, y - 6).lineWidth(0.5).strokeColor(LINE).stroke();
  }
}

/** One PDF with the sheets of the given routes, each starting on a new page. */
export async function routeSheetsPdf(routeIds: number[], locale: Locale): Promise<Buffer | null> {
  const sheets = (await Promise.all(routeIds.map(routeSheetData))).filter((s): s is SheetData => s !== null);
  if (sheets.length === 0) return null;
  const doc = new PDFDocument({ size: 'A4', margin: M, info: { Title: `${translator(locale)('sheet.title')} ${sheets[0].campaign.name}`, Author: config.brand.orgName } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  sheets.forEach((sheet, i) => {
    if (i > 0) doc.addPage();
    drawSheet(doc, sheet, locale);
  });
  doc.end();
  return done;
}

import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { SwissQRBill } from 'swissqrbill/pdf';
import { calculateQRReferenceChecksum, calculateSCORReferenceChecksum, isQRIBAN } from 'swissqrbill/utils';
import { CEVI_LOGO_PATHS, formatChf, formatDate, translator, type Locale } from '@zopf/shared';
import { config } from './config.js';

/**
 * Invoice as A4 PDF with the Swiss QR payment slip (same build as in the Cevi
 * shop: pdfkit + swissqrbill). Sender, logo and account come from the
 * environment; without an account there is no slip (and no QR invoice at all).
 * Paid invoices carry "amount received" instead of a slip.
 */

export interface InvoiceData {
  /** Database id; makes the QR reference unique when the account is a QR-IBAN. */
  orderId: number;
  number: string;
  locale: Locale;
  date: Date;
  dueDate: Date;
  deliveryDate: Date;
  campaignName: string;
  customer: { name: string; street: string; houseNumber: string; zip: string; city: string; email: string };
  items: { productName: string; sizeLabel: string; quantity: number; unitPriceRappen: number }[];
  donationRappen: number;
  totalRappen: number;
  paid: boolean;
  /** "Zahlungserinnerung" instead of "Rechnung". */
  reminder?: boolean;
}

const INK = '#18181b';
const MUTED = '#71717a';
const LINE = '#e4e4e7';
const MARGIN = 56;
const PAGE_WIDTH = 595.28;
const CONTENT = PAGE_WIDTH - 2 * MARGIN;
/** The payment slip takes the lowest 105 mm of an A4 page. */
const SLIP_HEIGHT = 298;

/** The club's own logo.png (pdfkit reads PNG/JPEG, not SVG), otherwise the Cevi logo as vector. */
export function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  const own = path.join(config.brandingDir, 'logo.png');
  if (fs.existsSync(own)) {
    try {
      doc.image(own, x, y, { fit: [size, size] });
      return;
    } catch {
      // Unreadable file: fall back to the default.
    }
  }
  doc.save();
  doc.translate(x, y).scale(size / 500);
  doc.path(CEVI_LOGO_PATHS.red).fill(CEVI_LOGO_PATHS.redColor);
  doc.path(CEVI_LOGO_PATHS.blue).fill(CEVI_LOGO_PATHS.blueColor);
  doc.restore();
}

/**
 * Structured reference on the slip, so a payment can be matched to its order
 * (by hand today, from a bank file later):
 * - QR-IBAN: QR reference, 26 digits from the order id plus a check digit (required).
 * - normal IBAN: creditor reference ISO 11649 ("SCOR", RF + 2 check digits + up to 21
 *   letters/digits): the order number without hyphens, e.g. RF.. ZOPF20270042; the
 *   order id if the number is too long.
 * The message with the order number stays on the slip as well.
 */
export function paymentReference(iban: string, orderId: number, orderNumber: string): string {
  if (isQRIBAN(iban.replace(/\s+/g, ''))) {
    const base = String(orderId).padStart(26, '0');
    return base + calculateQRReferenceChecksum(base);
  }
  const fromNumber = orderNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const base = fromNumber.length > 0 && fromNumber.length <= 21 ? fromNumber : String(orderId);
  return `RF${calculateSCORReferenceChecksum(base)}${base}`;
}

/** Street and house number for the slip: swissqrbill wants them apart. */
function slipAddress(street: string, houseNumber: string) {
  return houseNumber ? { address: street.slice(0, 70), buildingNumber: houseNumber.slice(0, 16) } : { address: street.slice(0, 70) };
}

export function renderInvoice(data: InvoiceData): Promise<Buffer> {
  const t = translator(data.locale);
  const brand = config.brand;
  const account = config.bankAccount;
  const title = data.reminder ? t('invoice.reminderTitle') : t('invoice.title');
  const withSlip = !data.paid && account !== null && data.totalRappen > 0;
  const money = (r: number) => formatChf(r, data.locale);
  const day = (d: Date) => formatDate(d, data.locale, false);

  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: `${title} ${data.number}`, Author: brand.orgName } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  /* ---- letterhead ---- */
  drawLogo(doc, MARGIN, 40, 40);
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  [brand.appName, brand.orgName, brand.postalAddress, brand.contactEmail].filter(Boolean).forEach((line, i) => {
    doc.text(line as string, MARGIN, 42 + i * 11.5, { width: CONTENT, align: 'right' });
  });
  doc.rect(MARGIN, 96, CONTENT * 0.6, 2).fill(brand.primary);
  doc.rect(MARGIN + CONTENT * 0.6, 96, CONTENT * 0.4, 2).fill(brand.secondary);

  /* ---- title and facts ---- */
  doc.font('Helvetica-Bold').fontSize(24).fillColor(INK).text(title, MARGIN, 124);
  doc.font('Helvetica').fontSize(10.5).fillColor(MUTED).text(`${data.number} · ${data.campaignName}`, MARGIN, 156);

  const column = CONTENT / 3;
  const fact = (label: string, value: string, x: number, y: number) => {
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y, { characterSpacing: 0.6, width: column - 12 });
    doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(value, x, y + 12, { width: column - 12 });
  };
  const c = data.customer;
  fact(t('invoice.to'), [c.name, `${c.street} ${c.houseNumber}`.trim(), `${c.zip} ${c.city}`].join('\n'), MARGIN, 190);
  fact(t('invoice.date'), day(data.date), MARGIN + column, 190);
  fact(t('invoice.delivery'), day(data.deliveryDate), MARGIN + column, 230);
  if (!data.paid) fact(t('invoice.due'), day(data.dueDate), MARGIN + 2 * column, 190);

  /* ---- items ---- */
  const cols = { name: MARGIN, qty: MARGIN + CONTENT - 210, price: MARGIN + CONTENT - 150, sum: MARGIN + CONTENT - 80 };
  let y = 290;
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text(t('invoice.item').toUpperCase(), cols.name, y, { characterSpacing: 0.6 });
  doc.text(t('invoice.qty').toUpperCase(), cols.qty, y, { width: 50, align: 'right', characterSpacing: 0.6 });
  doc.text(t('invoice.price').toUpperCase(), cols.price, y, { width: 60, align: 'right', characterSpacing: 0.6 });
  doc.text(t('invoice.amount').toUpperCase(), cols.sum, y, { width: 80, align: 'right', characterSpacing: 0.6 });
  y += 16;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT, y).lineWidth(1).strokeColor(INK).stroke();
  y += 10;

  const rows = [
    ...data.items.map((i) => ({ name: `${i.productName} ${i.sizeLabel}`, detail: null as string | null, qty: String(i.quantity), price: money(i.unitPriceRappen), sum: i.quantity * i.unitPriceRappen })),
    ...(data.donationRappen > 0 ? [{ name: t('summary.donation'), detail: t('invoice.donationDetail'), qty: '', price: '', sum: data.donationRappen }] : []),
  ];
  for (const row of rows) {
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(row.name, cols.name, y, { width: cols.qty - cols.name - 12 });
    if (row.detail) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(row.detail, cols.name, doc.y + 1);
    doc.font('Helvetica').fontSize(10.5).fillColor(INK);
    doc.text(row.qty, cols.qty, y, { width: 50, align: 'right' });
    doc.text(row.price, cols.price, y, { width: 60, align: 'right' });
    doc.text(money(row.sum), cols.sum, y, { width: 80, align: 'right' });
    y += row.detail ? 34 : 22;
    doc.moveTo(MARGIN, y - 7).lineTo(MARGIN + CONTENT, y - 7).lineWidth(0.5).strokeColor(LINE).stroke();
  }

  /* ---- total ---- */
  y += 8;
  doc.font('Helvetica').fontSize(10.5).fillColor(MUTED).text(`${t('summary.total')} CHF`, cols.price - 100, y + 5, { width: 160, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(money(data.totalRappen), cols.sum - 40, y, { width: 120, align: 'right' });
  y += 40;

  /* ---- how to pay, thanks ---- */
  const notes = [data.paid ? t('invoice.paid') : withSlip ? t('invoice.howToPay') : null, t('invoice.thanks', { appName: brand.appName })].filter(Boolean) as string[];
  const limit = withSlip ? doc.page.height - SLIP_HEIGHT - 14 : doc.page.height - MARGIN;
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED);
  for (const text of notes) {
    const height = doc.heightOfString(text, { width: CONTENT * 0.75 });
    if (y + height > limit) break;
    doc.text(text, MARGIN, y, { width: CONTENT * 0.75, lineGap: 2 });
    y = doc.y + 8;
  }

  /* ---- payment slip ---- */
  if (withSlip && account) {
    const bill = new SwissQRBill(
      {
        amount: data.totalRappen / 100,
        currency: 'CHF',
        creditor: { account: account.iban, name: account.name.slice(0, 70), ...slipAddress(account.address, ''), zip: account.zip, city: account.city, country: 'CH' },
        debtor: c.street
          ? { name: c.name.slice(0, 70), ...slipAddress(c.street, c.houseNumber), zip: c.zip, city: c.city.slice(0, 35), country: 'CH' }
          : undefined,
        reference: paymentReference(account.iban, data.orderId, data.number),
        message: [account.message, data.number].filter(Boolean).join(' ').slice(0, 140),
      },
      { language: data.locale === 'en' ? 'EN' : 'DE' }
    );
    doc.fillColor('black').strokeColor('black');
    bill.attachTo(doc);
  }

  doc.end();
  return done;
}

/** "Rechnung-ZOPF-2027-0042.pdf" / "Invoice-…". */
export function invoiceFilename(number: string, locale: Locale) {
  return `${locale === 'en' ? 'Invoice' : 'Rechnung'}-${number}.pdf`;
}

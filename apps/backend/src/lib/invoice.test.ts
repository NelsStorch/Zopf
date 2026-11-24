import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { invoiceFilename, qrReference, renderInvoice, type InvoiceData } from './invoice.js';

const data: InvoiceData = {
  orderId: 42,
  number: 'ZOPF-2027-0042',
  locale: 'de',
  date: new Date('2027-02-20'),
  dueDate: new Date('2027-03-22'),
  deliveryDate: new Date('2027-03-13'),
  campaignName: 'Zopfaktion 2027',
  customer: { name: 'Anna Muster', street: 'Musterstrasse', houseNumber: '12a', zip: '8000', city: 'Musterhausen', email: 'anna@example.ch' },
  items: [{ productName: 'Butterzopf', sizeLabel: '500 g', quantity: 2, unitPriceRappen: 800 }],
  donationRappen: 450,
  totalRappen: 2050,
  paid: false,
};

// Example accounts from the SIX implementation guidelines and swissqrbill docs (not real accounts).
const QR_IBAN = 'CH44 3199 9123 0008 8901 2';
const ACCOUNT = {
  PAYMENT_IBAN: 'CH58 0079 1123 0008 8901 2',
  PAYMENT_CREDITOR_NAME: 'Verein Muster',
  PAYMENT_CREDITOR_ADDRESS: 'Musterweg 1',
  PAYMENT_CREDITOR_ZIP: '8000',
  PAYMENT_CREDITOR_CITY: 'Musterhausen',
  PAYMENT_MESSAGE: 'Zopfaktion',
};

describe('renderInvoice', () => {
  beforeEach(() => Object.assign(process.env, ACCOUNT));
  afterEach(() => {
    for (const key of Object.keys(ACCOUNT)) delete process.env[key];
  });

  it('makes a PDF with the payment slip for an open invoice', async () => {
    const pdf = await renderInvoice(data);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // The slip adds a lot (QR code, scissors, two parts): clearly bigger than without.
    const paid = await renderInvoice({ ...data, paid: true });
    expect(pdf.length).toBeGreaterThan(paid.length);
  });

  it('works in English and as a reminder', async () => {
    const pdf = await renderInvoice({ ...data, locale: 'en', reminder: true });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('still renders without an account (no slip)', async () => {
    for (const key of Object.keys(ACCOUNT)) delete process.env[key];
    const pdf = await renderInvoice(data);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('uses a QR reference when the account is a QR-IBAN', async () => {
    process.env.PAYMENT_IBAN = QR_IBAN;
    const pdf = await renderInvoice(data);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(qrReference(QR_IBAN, 42)).toMatch(/^0{24}42\d$/);
    expect(qrReference(ACCOUNT.PAYMENT_IBAN, 42)).toBeUndefined();
  });

  it('names the file in the customer language', () => {
    expect(invoiceFilename('ZOPF-2027-0042', 'de')).toBe('Rechnung-ZOPF-2027-0042.pdf');
    expect(invoiceFilename('ZOPF-2027-0042', 'en')).toBe('Invoice-ZOPF-2027-0042.pdf');
  });
});

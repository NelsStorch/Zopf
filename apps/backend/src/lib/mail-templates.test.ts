import { describe, expect, it } from 'vitest';
import { confirmedMail, confirmRequestMail, type OrderSummary } from './mail-templates.js';

const summary: OrderSummary = {
  number: 'ZOPF-2027-0042',
  customerName: '<b>Anna</b> & Co',
  email: 'anna@example.ch',
  locale: 'de',
  items: [{ productName: 'Butterzopf', sizeLabel: '500 g', quantity: 2, unitPriceRappen: 800 }],
  donationRappen: 400,
  totalRappen: 2000,
  address: { street: 'Musterstrasse', houseNumber: '1', zip: '8000', city: 'Musterhausen', manual: false },
  paymentMethod: 'ON_DELIVERY',
  campaign: { name: 'Zopfaktion 2027', deliveryDate: new Date('2027-03-13'), orderDeadline: new Date('2027-03-06T17:00:00Z') },
};

describe('mail templates', () => {
  it('escapes customer input in the HTML, keeps it readable in the text', () => {
    const mail = confirmRequestMail(summary, 'https://example.ch/bestellung/bestaetigen/abc');
    expect(mail.html).toContain('&lt;b&gt;Anna&lt;/b&gt; &amp; Co');
    expect(mail.html).not.toContain('<b>Anna</b>');
    expect(mail.text).toContain('Hallo <b>Anna</b> & Co');
    expect(mail.to).toBe('anna@example.ch');
  });

  it('lists items, donation and total, and the link', () => {
    const mail = confirmRequestMail(summary, 'https://example.ch/bestellung/bestaetigen/abc');
    expect(mail.text).toContain('2 × Butterzopf 500 g: CHF 16.00');
    expect(mail.text).toContain('Spende: CHF 4.00');
    expect(mail.text).toContain('Total: CHF 20.00');
    expect(mail.text).toContain('https://example.ch/bestellung/bestaetigen/abc');
  });

  it('tells how to pay and writes English for English orders', () => {
    const mail = confirmedMail({ ...summary, locale: 'en' }, 'https://example.ch/bestellung/xyz');
    expect(mail.subject).toBe('Order ZOPF-2027-0042 confirmed');
    expect(mail.text).toContain('please have CHF 20.00 ready at delivery');
  });
});

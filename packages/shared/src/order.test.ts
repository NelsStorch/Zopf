import { describe, expect, it } from 'vitest';
import { donationSuggestions, OrderCreateSchema } from './order.js';

const valid = {
  items: [{ sizeId: 1, quantity: 2 }],
  address: { kind: 'directory', addressId: 5 },
  customerName: 'Anna Muster',
  email: ' Anna@Example.CH ',
  paymentMethod: 'QR_INVOICE',
  consent: true,
};

describe('OrderCreateSchema', () => {
  it('accepts an order and cleans up the e-mail', () => {
    const parsed = OrderCreateSchema.parse(valid);
    expect(parsed.email).toBe('anna@example.ch');
    expect(parsed.donationRappen).toBe(0);
    expect(parsed.locale).toBe('de');
  });

  it('needs the consent tick', () => {
    expect(OrderCreateSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
  });

  it('accepts a manual address and rejects a foreign postal code format', () => {
    const manual = { kind: 'manual', street: 'Neuweg', houseNumber: '3', zip: '8000', city: 'Musterhausen' };
    expect(OrderCreateSchema.safeParse({ ...valid, address: manual }).success).toBe(true);
    expect(OrderCreateSchema.safeParse({ ...valid, address: { ...manual, zip: 'D-80331' } }).success).toBe(false);
  });

  it('rejects nonsense quantities, donations and phone numbers', () => {
    expect(OrderCreateSchema.safeParse({ ...valid, items: [{ sizeId: 1, quantity: 0 }] }).success).toBe(false);
    expect(OrderCreateSchema.safeParse({ ...valid, donationRappen: -100 }).success).toBe(false);
    expect(OrderCreateSchema.safeParse({ ...valid, phone: 'call me' }).success).toBe(false);
    expect(OrderCreateSchema.safeParse({ ...valid, phone: '079 123 45 67' }).success).toBe(true);
  });
});

describe('donationSuggestions', () => {
  it('rounds up to the next 5 and 10 francs and adds fixed amounts', () => {
    // CHF 23.00 -> +2.00 (25), +7.00 (30), 5, 10
    expect(donationSuggestions(2300)).toEqual([200, 500, 700, 1000]);
  });

  it('never suggests 0 for an even amount', () => {
    expect(donationSuggestions(2000).every((v) => v > 0)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { CampaignInputSchema, orderNumber, shiftYear, SizeInputSchema, slugify } from './campaign.js';

const valid = {
  name: 'Zopfaktion 2027',
  deliveryDate: '2027-03-13',
  orderDeadline: '2027-03-06T17:00:00.000Z',
  invoiceDueDays: 30,
  zipCodes: ['8000'],
  orderPrefix: 'zopf-2027',
};

describe('campaign helpers', () => {
  it('makes URL-safe slugs', () => {
    expect(slugify('Zöpfe für Früh-Aufsteher 2027!')).toBe('zopfe-fur-fruh-aufsteher-2027');
    expect(slugify('   ')).toBe('aktion');
  });

  it('shifts a day by a year, also from 29 February', () => {
    expect(shiftYear('2027-03-13')).toBe('2028-03-13');
    expect(shiftYear('2028-02-29')).toBe('2029-02-28');
  });

  it('formats order numbers', () => {
    expect(orderNumber('ZOPF-2027', 42)).toBe('ZOPF-2027-0042');
  });
});

describe('CampaignInputSchema', () => {
  it('accepts a campaign, upper-cases the prefix and turns empty texts into null', () => {
    const parsed = CampaignInputSchema.parse({ ...valid, infoDe: '  ' });
    expect(parsed.orderPrefix).toBe('ZOPF-2027');
    expect(parsed.infoDe).toBeNull();
  });

  it('rejects bad postal codes and dates', () => {
    expect(CampaignInputSchema.safeParse({ ...valid, zipCodes: ['800'] }).success).toBe(false);
    expect(CampaignInputSchema.safeParse({ ...valid, deliveryDate: '13.03.2027' }).success).toBe(false);
  });

  it('rejects negative prices', () => {
    expect(SizeInputSchema.safeParse({ labelDe: '500 g', priceRappen: -1 }).success).toBe(false);
  });
});

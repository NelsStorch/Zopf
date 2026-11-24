import { describe, expect, it } from 'vitest';
import { brandFromEnv, DEFAULT_BRAND, normalizeHex, readableOn } from './branding.js';
import { resolveLocale, translator } from './i18n/index.js';
import { formatChf, parseChf } from './money.js';

describe('branding', () => {
  it('falls back to the Cevi defaults', () => {
    const brand = brandFromEnv({});
    expect(brand.orgName).toBe(DEFAULT_BRAND.orgName);
    expect(brand.primary).toBe(DEFAULT_BRAND.primary);
    expect(brand.contactEmail).toBeNull();
  });

  it('takes valid values from the environment and ignores invalid colours', () => {
    const brand = brandFromEnv({ ORG_NAME: ' Pfadi Muster ', BRAND_COLOR_PRIMARY: '#0F0', BRAND_COLOR_SECONDARY: 'red' });
    expect(brand.orgName).toBe('Pfadi Muster');
    expect(brand.primary).toBe('#00ff00');
    expect(brand.secondary).toBe(DEFAULT_BRAND.secondary);
  });

  it('normalises hex colours', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('abc')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
  });

  it('picks a readable text colour', () => {
    expect(readableOn('#003d8f')).toBe('#ffffff');
    expect(readableOn('#ffee00')).toBe('#111111');
  });
});

describe('i18n', () => {
  it('prefers the cookie, then Accept-Language, then German', () => {
    expect(resolveLocale('en', 'de-CH')).toBe('en');
    expect(resolveLocale(undefined, 'fr-CH, en;q=0.8, de;q=0.5')).toBe('en');
    expect(resolveLocale('xx', 'fr')).toBe('de');
  });

  it('fills placeholders', () => {
    const t = translator('de');
    expect(t('home.deadline', { date: '1. März' })).toBe('Bestellen bis 1. März');
  });
});

describe('money', () => {
  it('formats and parses Rappen', () => {
    expect(formatChf(2450)).toBe('24.50');
    expect(parseChf('24.5')).toBe(2450);
    expect(parseChf("1'200,05")).toBe(120005);
    expect(parseChf('-3')).toBeNull();
    expect(parseChf('1.234')).toBeNull();
  });
});

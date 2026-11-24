/** Amounts are kept in Rappen (integer) everywhere; only display turns them into francs. */

export function formatChf(rappen: number, locale: 'de' | 'en' = 'de'): string {
  return (rappen / 100).toLocaleString(locale === 'de' ? 'de-CH' : 'en-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "24.50" or "24" -> 2450. Returns null for anything that is not a non-negative amount with at most two decimals. */
export function parseChf(value: string): number | null {
  const v = value.trim().replace(/['’\s]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const [francs, cents = ''] = v.split('.');
  return Number(francs) * 100 + Number(cents.padEnd(2, '0'));
}

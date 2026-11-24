import type { AddressSuggestion } from '@zopf/shared';
import { prisma } from './prisma.js';
import { normalizeForSearch } from './geo.js';

const collator = new Intl.Collator('de-CH', { numeric: true, sensitivity: 'base' });

/**
 * Address search for the order form: every word typed must appear in street,
 * number, postal code or place ("bahnhof 12 8307" works). Only the postal codes
 * of the delivery area. Streets starting with the first word come first, house
 * numbers in natural order (2 before 10, 12 before 12a).
 */
export async function searchAddresses(query: string, zipCodes: string[], limit = 8): Promise<AddressSuggestion[]> {
  const tokens = normalizeForSearch(query).split(' ').filter(Boolean).slice(0, 6);
  if (tokens.length === 0 || zipCodes.length === 0 || tokens.join('').length < 2) return [];
  const rows = await prisma.address.findMany({
    where: { zip: { in: zipCodes }, AND: tokens.map((t) => ({ searchText: { contains: t } })) },
    select: { id: true, street: true, houseNumber: true, zip: true, city: true },
    take: 200,
  });
  const first = tokens[0];
  return rows
    .sort(
      (a, b) =>
        Number(!normalizeForSearch(a.street).startsWith(first)) - Number(!normalizeForSearch(b.street).startsWith(first)) ||
        collator.compare(a.street, b.street) ||
        collator.compare(a.houseNumber, b.houseNumber) ||
        a.zip.localeCompare(b.zip)
    )
    .slice(0, limit);
}

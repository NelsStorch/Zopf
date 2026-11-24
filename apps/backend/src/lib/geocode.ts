import { normalizeForSearch } from './geo.js';

/**
 * Fallback for "my address is missing": asks the SearchServer of geo.admin.ch
 * (free, fair use) once per order and stores the result. Only the address goes
 * out, never a name or e-mail. Returns null when nothing in the same postal code
 * is found; the team then sets the pin by hand.
 */
const SEARCH_URL = 'https://api3.geo.admin.ch/rest/services/api/SearchServer';

interface SearchResult {
  attrs?: { detail?: string; lat?: number; lon?: number; origin?: string };
}

export async function geocodeAddress(
  address: { street: string; houseNumber: string; zip: string; city: string },
  fetchImpl: typeof fetch = fetch
): Promise<{ lat: number; lng: number } | null> {
  const searchText = `${address.street} ${address.houseNumber} ${address.zip} ${address.city}`.trim();
  const url = `${SEARCH_URL}?${new URLSearchParams({ searchText, type: 'locations', origins: 'address', sr: '4326', limit: '5' })}`;
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'Zopfaktion' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: SearchResult[] };
    const wantedStreet = normalizeForSearch(address.street).split(' ')[0];
    // Same postal code and street, otherwise a guess that would send the team to the wrong place.
    const hit = body.results?.find((r) => {
      const detail = r.attrs?.detail ?? '';
      return detail.includes(` ${address.zip} `) && (!wantedStreet || normalizeForSearch(detail).includes(wantedStreet));
    });
    const { lat, lon } = hit?.attrs ?? {};
    return typeof lat === 'number' && typeof lon === 'number' ? { lat, lng: lon } : null;
  } catch {
    return null;
  }
}

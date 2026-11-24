import { describe, expect, it } from 'vitest';
import { geocodeAddress } from './geocode.js';

const answer = (results: unknown[]) => (async () => new Response(JSON.stringify({ results }), { headers: { 'content-type': 'application/json' } })) as typeof fetch;

const address = { street: 'Bundesplatz', houseNumber: '3', zip: '3011', city: 'Bern' };

describe('geocodeAddress', () => {
  it('takes a hit in the same postal code and street', async () => {
    const fetchImpl = answer([{ attrs: { detail: 'bundesplatz 3 3011 bern 351 bern ch be', lat: 46.9467, lon: 7.4441 } }]);
    expect(await geocodeAddress(address, fetchImpl)).toEqual({ lat: 46.9467, lng: 7.4441 });
  });

  it('ignores hits elsewhere', async () => {
    const fetchImpl = answer([{ attrs: { detail: 'bundesplatz 3 6300 zug 1711 zug ch zg', lat: 47.1, lon: 8.5 } }]);
    expect(await geocodeAddress(address, fetchImpl)).toBeNull();
  });

  it('returns null when the service fails', async () => {
    const failing = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect(await geocodeAddress(address, failing)).toBeNull();
  });
});

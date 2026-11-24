import { describe, expect, it } from 'vitest';
import { lv95ToWgs84, normalizeForSearch } from './geo.js';

describe('lv95ToWgs84', () => {
  it('matches swisstopo reference points within a few metres', () => {
    // Zimmerwald observatory, swisstopo's worked example: 2 600 000 / 1 200 000 is the old Bern origin.
    const bern = lv95ToWgs84(2_600_000, 1_200_000);
    expect(bern.lat).toBeCloseTo(46.95108, 4);
    expect(bern.lng).toBeCloseTo(7.43863, 4);

    // Example from the formula document: E 2 700 000 / N 1 100 000.
    const p = lv95ToWgs84(2_700_000, 1_100_000);
    expect(p.lat).toBeCloseTo(46.04413, 3);
    expect(p.lng).toBeCloseTo(8.73084, 3);
  });
});

describe('normalizeForSearch', () => {
  it('drops accents, case and punctuation and spells out "str."', () => {
    expect(normalizeForSearch('Rue de l’Église 12a')).toBe('rue de l eglise 12a');
    expect(normalizeForSearch('Bahnhofstr. 3')).toBe('bahnhofstrasse 3');
    expect(normalizeForSearch('  Zürichstrasse  ')).toBe('zurichstrasse');
  });
});

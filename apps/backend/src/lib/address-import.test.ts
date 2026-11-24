import { describe, expect, it } from 'vitest';
import { collectAddresses, parseCsvLine } from './address-import.js';

// Same columns as the swisstopo file; the rows are made up.
const HEADER =
  '﻿ADR_EGAID;STR_ESID;BDG_EGID;ADR_EDID;STN_LABEL;ADR_NUMBER;BDG_CATEGORY;BDG_NAME;ZIP_LABEL;COM_FOSNR;COM_NAME;COM_CANTON;ADR_STATUS;ADR_OFFICIAL;ADR_MODIFIED;ADR_EASTING;ADR_NORTHING';
const row = (egaid: string, street: string, number: string, zipLabel: string, status = 'real') =>
  `${egaid};1;1;0;${street};${number};residential;;${zipLabel};1;Musterhausen;ZH;${status};true;01.01.2026;2690000.0;1250000.0`;

async function* lines(...items: string[]) {
  for (const item of items) yield item;
}

describe('parseCsvLine', () => {
  it('splits plain and quoted fields', () => {
    expect(parseCsvLine('a;b;c')).toEqual(['a', 'b', 'c']);
    expect(parseCsvLine('1;"Rue; de ""la"" Gare";3')).toEqual(['1', 'Rue; de "la" Gare', '3']);
  });
});

describe('collectAddresses', () => {
  it('keeps existing addresses in the wanted postal codes and converts coordinates', async () => {
    const rows = await collectAddresses(
      lines(
        HEADER,
        row('1', 'Musterstrasse', '1', '8000 Musterhausen'),
        row('2', 'Musterstrasse', '2', '9000 Anderswo'),
        row('3', 'Neubauweg', '5', '8000 Musterhausen', 'planned'),
        row('4', 'Dorfstrasse', '12a', '8000 Musterhausen'),
        ''
      ),
      new Set(['8000'])
    );
    expect(rows.map((r) => r.egaid)).toEqual(['1', '4']);
    expect(rows[1]).toMatchObject({ street: 'Dorfstrasse', houseNumber: '12a', zip: '8000', city: 'Musterhausen', searchText: 'dorfstrasse 12a 8000 musterhausen' });
    expect(rows[0].lat).toBeGreaterThan(47);
    expect(rows[0].lng).toBeGreaterThan(8);
  });

  it('stops on a file with other columns instead of importing nonsense', async () => {
    await expect(collectAddresses(lines('A;B;C', '1;2;3'), new Set(['8000']))).rejects.toThrow(/Spalten fehlen/);
  });
});

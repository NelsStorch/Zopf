import { describe, expect, it } from 'vitest';
import { csvCell } from './reports.js';

describe('csvCell', () => {
  it('leaves plain values alone and quotes separators, quotes and line breaks', () => {
    expect(csvCell('Anna Muster')).toBe('Anna Muster');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('sag "hallo"')).toBe('"sag ""hallo"""');
    expect(csvCell('zwei\nzeilen')).toBe('"zwei\nzeilen"');
  });

  it('defuses spreadsheet formulas from customer input but keeps negative numbers', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+41 79 123 45 67')).toBe("'+41 79 123 45 67");
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});

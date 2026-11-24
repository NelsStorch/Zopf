/**
 * Swiss LV95 (EPSG:2056) to WGS84, with swisstopo's approximate formulas
 * ("Approximate formulas for the transformation between Swiss projection
 * coordinates and WGS84"). Accurate to about a metre, plenty for delivery maps.
 */
export function lv95ToWgs84(easting: number, northing: number): { lat: number; lng: number } {
  const y = (easting - 2_600_000) / 1_000_000;
  const x = (northing - 1_200_000) / 1_000_000;

  const lng = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x * x * x;

  // Results of the formulas are in units of 10000", i.e. * 100 / 36 gives degrees.
  return { lat: (lat * 100) / 36, lng: (lng * 100) / 36 };
}

/** Lower case, without accents and punctuation, single spaces: the form addresses are searched in. */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/str\.(?=\s|$)/g, 'strasse')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

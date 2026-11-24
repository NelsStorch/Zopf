/**
 * Branding of an installation. Everything a club wants to change comes from the
 * environment (see .env.example); what is not set falls back to the Cevi look.
 * Both apps read it at run time, so one image serves every club.
 */

export const DEFAULT_BRAND = {
  orgName: 'Cevi',
  appName: 'Zopfaktion',
  /** Cevi blue and red, as in the logo. */
  primary: '#003d8f',
  secondary: '#e20031',
} as const;

/** Cevi logo as two paths on a 500 x 500 canvas (same drawing as in the shift planner). */
export const CEVI_LOGO_PATHS = {
  red: 'M 321.69737,357.21491 C 287.28947,367.10965 252.80263,373.24123 220.24561,375.68421 L 342.04386,497.30702 L 385.28509,335.97368 C 366.14474,343.46491 345.02631,350.50439 321.69737,357.21491 z M 430.11403,155.98684 C 385.74123,184.9693 331.41228,209.90351 280.88158,224.43421 C 211.38596,244.41667 140.64474,250.60526 86.609649,241.46491 L 4.0745614,159.05263 L 462.29824,35.894737 L 430.11403,155.98684 z',
  blue: 'M 6.6710526,190.96053 C 6.0394737,188.60965 5.6622807,186.18421 5.4342105,183.72807 L 54.574561,232.79825 C 28.008772,223.31579 11.5,208.97807 6.6710526,190.96053 z M 497.38596,242.87719 C 462.67105,285.34649 407.07017,315.84649 317.23246,341.68421 C 225.59649,368.0307 134.16667,367.2193 84.307017,339.60965 C 66.763158,329.89035 55.763158,317.63596 51.614035,303.18421 L 25.328947,237.97807 C 26.320175,238.57456 27.307017,239.1886 28.289474,239.73246 C 82.078947,269.52193 183.01754,269.74123 285.43421,240.28947 C 367.38158,216.72368 453.30702,169.02632 497.38158,123.0307 L 497.38158,242.87719 L 497.38596,242.87719 z M 342.04386,51.662281 L 21.991228,137.16667 C 54.93421,90.149123 132.27193,43.894737 221.70614,18.179825 C 246.83333,10.95614 302.99561,1.881579 342.04386,3.3333334 L 342.04386,51.662281 z',
  redColor: '#e20031',
  blueColor: '#003d8f',
} as const;

export const DEFAULT_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><path fill="${CEVI_LOGO_PATHS.redColor}" d="${CEVI_LOGO_PATHS.red}"/><path fill="${CEVI_LOGO_PATHS.blueColor}" d="${CEVI_LOGO_PATHS.blue}"/></svg>`;

export interface Brand {
  orgName: string;
  appName: string;
  primary: string;
  secondary: string;
  contactEmail: string | null;
  imprintUrl: string | null;
  postalAddress: string | null;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A hex colour as #rrggbb in lower case, or null for anything else. */
export function normalizeHex(value: string | undefined | null): string | null {
  const v = value?.trim();
  if (!v || !HEX.test(v)) return null;
  const hex = v.slice(1).toLowerCase();
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex}`;
}

/** Relative luminance (WCAG 2.x) of a #rrggbb colour. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever reads better on the given background. */
export function readableOn(hex: string): '#ffffff' | '#111111' {
  return luminance(hex) > 0.4 ? '#111111' : '#ffffff';
}

const text = (value: string | undefined) => {
  const v = value?.trim();
  return v ? v : null;
};

/** Reads the brand from an environment object (process.env in both apps). */
export function brandFromEnv(env: Record<string, string | undefined>): Brand {
  return {
    orgName: text(env.ORG_NAME) ?? DEFAULT_BRAND.orgName,
    appName: text(env.APP_NAME) ?? DEFAULT_BRAND.appName,
    primary: normalizeHex(env.BRAND_COLOR_PRIMARY) ?? DEFAULT_BRAND.primary,
    secondary: normalizeHex(env.BRAND_COLOR_SECONDARY) ?? DEFAULT_BRAND.secondary,
    contactEmail: text(env.CONTACT_EMAIL),
    imprintUrl: text(env.LEGAL_IMPRINT_URL),
    postalAddress: text(env.LEGAL_POSTAL_ADDRESS),
  };
}

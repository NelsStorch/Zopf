import { brandFromEnv } from '@zopf/shared';

/**
 * Settings of this installation, all from the environment (see .env.example).
 * Nothing club- or server-specific lives in the code.
 */

const env = (name: string): string | undefined => {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
};

const intEnv = (name: string, fallback: number): number => {
  const v = Number(env(name));
  return Number.isInteger(v) && v > 0 ? v : fallback;
};

export interface BankAccount {
  iban: string;
  name: string;
  address: string;
  zip: string;
  city: string;
  message: string | undefined;
}

export const config = {
  get brand() {
    return brandFromEnv(process.env);
  },

  /** Address of this installation, for links in mails. https://<APP_DOMAIN>, locally http://localhost:3000. */
  get publicUrl(): string {
    const explicit = env('PUBLIC_URL');
    if (explicit) return explicit.replace(/\/+$/, '');
    const domain = env('APP_DOMAIN');
    return domain ? `https://${domain}` : 'http://localhost:3000';
  },

  /** Account for the QR invoice; null switches the QR invoice off. */
  get bankAccount(): BankAccount | null {
    const iban = env('PAYMENT_IBAN');
    const name = env('PAYMENT_CREDITOR_NAME');
    const zip = env('PAYMENT_CREDITOR_ZIP');
    const city = env('PAYMENT_CREDITOR_CITY');
    if (!iban || !name || !zip || !city) return null;
    return { iban: iban.replace(/\s+/g, ''), name, address: env('PAYMENT_CREDITOR_ADDRESS') ?? '', zip, city, message: env('PAYMENT_MESSAGE') };
  },

  get twintPayload(): string | null {
    return env('TWINT_QR_PAYLOAD') ?? null;
  },

  get osrmUrl(): string | null {
    return env('OSRM_URL') ?? null;
  },

  get retentionMonths(): number {
    return intEnv('PERSONAL_DATA_RETENTION_MONTHS', 24);
  },

  get orderConfirmHours(): number {
    return intEnv('ORDER_CONFIRM_HOURS', 48);
  },

  /** Folder with an own logo.svg / logo.png / favicon.ico (mounted volume). */
  get brandingDir(): string {
    return env('BRANDING_DIR') ?? '/branding';
  },
};

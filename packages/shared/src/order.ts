import { z } from 'zod';
import { LOCALES } from './i18n/index.js';
import { PAYMENT_METHODS, type PaymentMethod } from './schemas.js';
import { ZIP_CODE } from './campaign.js';

/** Optional free text: empty strings become null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const MAX_QUANTITY = 99;
/** At most CHF 1000 on top; more is surely a typo. */
export const MAX_DONATION_RAPPEN = 100_000;

export const OrderItemInputSchema = z.object({
  sizeId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
});

export const OrderAddressSchema = z.discriminatedUnion('kind', [
  // Picked from the address directory.
  z.object({ kind: z.literal('directory'), addressId: z.number().int().positive() }),
  // "My address is missing": typed by hand, checked by the team.
  z.object({
    kind: z.literal('manual'),
    street: z.string().trim().min(2).max(120),
    houseNumber: z.string().trim().max(20),
    zip: z.string().trim().regex(ZIP_CODE),
    city: z.string().trim().min(2).max(80),
  }),
]);
export type OrderAddress = z.infer<typeof OrderAddressSchema>;

/** What a customer can set and later change on the personal order page. */
export const OrderChangeSchema = z.object({
  items: z.array(OrderItemInputSchema).min(1).max(50),
  donationRappen: z.number().int().min(0).max(MAX_DONATION_RAPPEN).default(0),
  address: OrderAddressSchema,
  customerName: z.string().trim().min(2).max(120),
  phone: optionalText(40).refine((v) => v === null || /^[+0-9 ()/.-]{6,40}$/.test(v), 'phone'),
  notes: optionalText(500),
  paymentMethod: z.enum(PAYMENT_METHODS),
  reminderOptIn: z.boolean().default(false),
  locale: z.enum(LOCALES).default('de'),
});
export type OrderChange = z.infer<typeof OrderChangeSchema>;

export const OrderCreateSchema = OrderChangeSchema.extend({
  email: z.string().trim().toLowerCase().pipe(z.email().max(200)),
  /** Must be ticked: privacy notice read, at least 16 or parents agree. */
  consent: z.literal(true),
  /** Honeypot, hidden in the form; bots fill it in. */
  website: z.string().max(200).optional(),
});
export type OrderCreate = z.infer<typeof OrderCreateSchema>;

export const ResendLinkSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(200)), locale: z.enum(LOCALES).default('de') });

/** The personal order page (link with token). Names already in the customer's language. */
export interface PublicOrder {
  /** "ZOPF-2027-0042", null while unconfirmed. */
  number: string | null;
  status: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'CANCELLED';
  editable: boolean;
  campaign: { name: string; deliveryDate: string; deliveryTimeText: string | null; orderDeadline: string };
  items: { sizeId: number | null; productName: string; sizeLabel: string; quantity: number; unitPriceRappen: number }[];
  itemsRappen: number;
  donationRappen: number;
  totalRappen: number;
  customerName: string;
  email: string;
  phone: string | null;
  notes: string | null;
  address: { addressId: number | null; street: string; houseNumber: string; zip: string; city: string; manual: boolean };
  paymentMethod: PaymentMethod;
  paymentStatus: 'OPEN' | 'PAID';
  reminderOptIn: boolean;
  locale: 'de' | 'en';
}

/** Order list in the admin. */
export interface AdminOrderRow {
  id: number;
  number: string | null;
  status: PublicOrder['status'];
  createdAt: string;
  customerName: string;
  email: string;
  phone: string | null;
  address: string;
  addressManual: boolean;
  hasLocation: boolean;
  items: string;
  pieces: number;
  donationRappen: number;
  totalRappen: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PublicOrder['paymentStatus'];
  notes: string | null;
}

/** Donation suggestions for a subtotal: round up to the next 5 and 10 francs, plus fixed amounts. */
export function donationSuggestions(itemsRappen: number): number[] {
  const roundUp = (step: number) => Math.ceil((itemsRappen + 1) / step) * step - itemsRappen;
  const values = new Set<number>([roundUp(500), roundUp(1000), 500, 1000, 2000].filter((v) => v > 0 && v <= MAX_DONATION_RAPPEN));
  return [...values].sort((a, b) => a - b).slice(0, 4);
}

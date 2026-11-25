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
  paidVia: PaidVia | null;
  paidAt: string | null;
  deliveryStatus: 'PENDING' | 'DELIVERED' | 'NOT_HOME';
  deliveryNote: string | null;
  routeName: string | null;
  /** Last payment reminder sent, if any. */
  lastReminderAt: string | null;
  notes: string | null;
}

export const PAID_VIA = ['BANK', 'CASH', 'TWINT'] as const;
export type PaidVia = (typeof PAID_VIA)[number];

/** Mark one order paid (with how) or open again. */
export const PaymentUpdateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('PAID'), via: z.enum(PAID_VIA) }),
  z.object({ status: z.literal('OPEN') }),
]);
export type PaymentUpdate = z.infer<typeof PaymentUpdateSchema>;

export const OrderIdsSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(1000) });
export const BulkPaidSchema = OrderIdsSchema.extend({ via: z.enum(PAID_VIA) });

/** Donation suggestions for a subtotal: round up to the next 5 and 10 francs, plus fixed amounts. */
export function donationSuggestions(itemsRappen: number): number[] {
  const roundUp = (step: number) => Math.ceil((itemsRappen + 1) / step) * step - itemsRappen;
  const values = new Set<number>([roundUp(500), roundUp(1000), 500, 1000, 2000].filter((v) => v > 0 && v <= MAX_DONATION_RAPPEN));
  return [...values].sort((a, b) => a - b).slice(0, 4);
}

/** One line of the bakery list: how many of one product size. */
export interface BakeryLine {
  sizeId: number | null;
  productName: string;
  sizeLabel: string;
  quantity: number;
}

/** What the bakery needs: totals over all confirmed orders and per route (for packing the crates). */
export interface BakeryReport {
  campaign: { id: number; name: string; deliveryDate: string };
  orders: number;
  pieces: number;
  /** Rappen over all confirmed orders. */
  money: { totalRappen: number; donationRappen: number; openRappen: number };
  totals: BakeryLine[];
  routes: { id: number | null; name: string | null; color: string | null; orders: number; pieces: number; lines: BakeryLine[] }[];
}

/** State of the "remind me next year" mailing for one campaign. */
export interface ReminderStatus {
  /** Confirmed opt-ins in total. */
  contacts: number;
  /** Of these, already reminded for this campaign. */
  reminded: number;
  /** Still to remind for this campaign. */
  pending: number;
  running: boolean;
  sent: number;
  failed: number;
}

export const TestMailSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(200)), locale: z.enum(LOCALES).default('de') });
export const UnsubscribeSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) });

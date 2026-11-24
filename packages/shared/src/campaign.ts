import { z } from 'zod';
import { CAMPAIGN_STATUSES, type CampaignStatus } from './schemas.js';

/** Optional free text: empty strings become null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const ZIP_CODE = /^\d{4}$/;
export const ORDER_PREFIX = /^[A-Z0-9][A-Z0-9-]{0,19}$/;

export const CampaignInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Calendar day, YYYY-MM-DD. */
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deliveryTimeText: optionalText(120),
  /** Point in time with offset (the browser sends toISOString()). */
  orderDeadline: z.iso.datetime({ offset: true }),
  /** Markdown; rendered by the backend, never sent as HTML. */
  infoDe: optionalText(10_000),
  infoEn: optionalText(10_000),
  purposeDe: optionalText(10_000),
  purposeEn: optionalText(10_000),
  invoiceDueDays: z.number().int().min(0).max(120),
  zipCodes: z.array(z.string().trim().regex(ZIP_CODE)).max(300),
  orderPrefix: z.string().trim().toUpperCase().regex(ORDER_PREFIX),
  depotLat: z.number().min(45).max(48.5).nullish(),
  depotLng: z.number().min(5.5).max(11).nullish(),
});
export type CampaignInput = z.infer<typeof CampaignInputSchema>;

export const CampaignStatusSchema = z.object({ status: z.enum(CAMPAIGN_STATUSES) });

export const ProductInputSchema = z.object({
  nameDe: z.string().trim().min(1).max(120),
  nameEn: optionalText(120),
  descriptionDe: optionalText(1_000),
  descriptionEn: optionalText(1_000),
  isActive: z.boolean().default(true),
});
export type ProductInput = z.infer<typeof ProductInputSchema>;

export const SizeInputSchema = z.object({
  labelDe: z.string().trim().min(1).max(60),
  labelEn: optionalText(60),
  /** Rappen; at most CHF 1000 per piece. */
  priceRappen: z.number().int().min(0).max(100_000),
  isActive: z.boolean().default(true),
});
export type SizeInput = z.infer<typeof SizeInputSchema>;

export const ReorderSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });

export interface AdminSize {
  id: number;
  labelDe: string;
  labelEn: string | null;
  priceRappen: number;
  sortOrder: number;
  isActive: boolean;
  /** Ordered at least once: can be switched off, not deleted. */
  inUse: boolean;
}

export interface AdminProduct {
  id: number;
  nameDe: string;
  nameEn: string | null;
  descriptionDe: string | null;
  descriptionEn: string | null;
  sortOrder: number;
  isActive: boolean;
  sizes: AdminSize[];
}

export interface AdminCampaignSummary {
  id: number;
  slug: string;
  name: string;
  status: CampaignStatus;
  deliveryDate: string;
  orderDeadline: string;
  orderCount: number;
}

export interface AdminCampaign extends AdminCampaignSummary {
  deliveryTimeText: string | null;
  infoDe: string | null;
  infoEn: string | null;
  purposeDe: string | null;
  purposeEn: string | null;
  invoiceDueDays: number;
  zipCodes: string[];
  orderPrefix: string;
  depotLat: number | null;
  depotLng: number | null;
  products: AdminProduct[];
}

/** What the public pages get about a product (names already in the visitor's language). */
export interface PublicProduct {
  id: number;
  name: string;
  description: string | null;
  sizes: { id: number; label: string; priceRappen: number }[];
}

/** A hit of the address search when ordering. */
export interface AddressSuggestion {
  id: number;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
}

export const AddressImportSchema = z.object({ zipCodes: z.array(z.string().trim().regex(ZIP_CODE)).min(1).max(300) });

export interface AddressImportStatus {
  running: boolean;
  phase: 'download' | 'read' | 'store' | null;
  last: { id: number; zipCodes: string[]; startedAt: string; finishedAt: string | null; imported: number; removed: number; error: string | null } | null;
  /** Addresses in the database per postal code. */
  counts: { zip: string; count: number }[];
}

/** URL part from a name: "Zopfaktion 2027" -> "zopfaktion-2027". */
export function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'aktion'
  );
}

/** Same calendar day a year later (29 February becomes 28 February). */
export function shiftYear(isoDay: string, years = 1): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  const target = new Date(Date.UTC(y + years, m - 1, d));
  if (target.getUTCMonth() !== m - 1) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/** "ZOPF-2027" + 42 -> "ZOPF-2027-0042". */
export function orderNumber(prefix: string, number: number): string {
  return `${prefix}-${String(number).padStart(4, '0')}`;
}

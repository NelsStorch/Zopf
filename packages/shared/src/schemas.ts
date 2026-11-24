import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
  remember: z.boolean().optional().default(false),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const PASSWORD_MIN = 10;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(PASSWORD_MIN).max(200),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const CAMPAIGN_STATUSES = ['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const PAYMENT_METHODS = ['QR_INVOICE', 'ON_DELIVERY'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** What the public pages get about the running campaign. Texts are HTML rendered and sanitised by the backend. */
export interface PublicCampaign {
  slug: string;
  name: string;
  status: CampaignStatus;
  deliveryDate: string;
  deliveryTimeText: string | null;
  orderDeadline: string;
  infoHtml: string | null;
  purposeHtml: string | null;
  products: import('./campaign.js').PublicProduct[];
  /** QR invoice possible (bank account configured on the server). */
  qrInvoiceAvailable: boolean;
  /** Postal codes of the delivery area. */
  zipCodes: string[];
}

export interface SessionUser {
  id: number;
  username: string;
  displayName: string | null;
  mustChangePassword: boolean;
}

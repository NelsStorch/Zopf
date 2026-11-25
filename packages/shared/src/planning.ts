import { z } from 'zod';

const HEX = /^#[0-9a-fA-F]{6}$/;

export const AutoPlanSchema = z.object({
  /** How many routes (delivery teams). */
  count: z.number().int().min(1).max(40),
  /** Start points to use; each route starts at the nearest of these. */
  depotIds: z.array(z.number().int().positive()).min(1).max(20),
});
export type AutoPlanInput = z.infer<typeof AutoPlanSchema>;

export const RouteInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(HEX),
  leaders: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => (v ? v : null)),
  depotId: z.number().int().positive().nullable(),
});
export type RouteInput = z.infer<typeof RouteInputSchema>;

export const AssignRouteSchema = z.object({ routeId: z.number().int().positive().nullable() });
export const SetLocationSchema = z.object({ lat: z.number().min(45.5).max(48), lng: z.number().min(5.8).max(10.6) });
export const RouteSequenceSchema = z.object({ orderIds: z.array(z.number().int().positive()).max(1000) });

export interface PlanningStop {
  orderId: number;
  number: string | null;
  customerName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  addressManual: boolean;
  pieces: number;
  items: string;
  notes: string | null;
  /** Amount still to collect at the door (cash/TWINT, or an unpaid QR invoice on delivery day). */
  openRappen: number;
  routeId: number | null;
  routeSeq: number | null;
}

export interface PlanningRoute {
  id: number;
  name: string;
  color: string;
  leaders: string | null;
  depotId: number | null;
  released: boolean;
  /** Secret link for the delivery team (admin only), null until handed over. */
  link: string | null;
  stops: number;
  pieces: number;
  openRappen: number;
  /** Straight-line length of the route from its start point, in metres. */
  lengthMeters: number;
}

export interface Planning {
  campaign: { id: number; name: string };
  depots: { id: number; name: string; lat: number | null; lng: number | null; address: string }[];
  routes: PlanningRoute[];
  /** All confirmed orders; routeId null = not assigned yet, lat null = needs a pin. */
  stops: PlanningStop[];
  /** OSRM_URL set: the order within routes uses real walking distances. */
  roadDistances: boolean;
}

/** What the delivery team sees behind the route link. */
export interface DeliveryRoute {
  route: { name: string; color: string; leaders: string | null };
  campaign: { name: string; deliveryDate: string; deliveryTimeText: string | null };
  depot: { name: string; address: string; lat: number | null; lng: number | null } | null;
  stops: {
    orderId: number;
    seq: number;
    number: string | null;
    customerName: string;
    address: string;
    lat: number | null;
    lng: number | null;
    phone: string | null;
    notes: string | null;
    items: string;
    pieces: number;
    openRappen: number;
    paymentMethod: 'QR_INVOICE' | 'ON_DELIVERY';
    deliveryStatus: 'PENDING' | 'DELIVERED' | 'NOT_HOME';
  }[];
  /** Static TWINT code of the club, if configured. */
  twintPayload: string | null;
}

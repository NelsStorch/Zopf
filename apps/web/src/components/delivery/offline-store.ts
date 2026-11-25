'use client';

import type { DeliveryEvent, DeliveryRoute } from '@zopf/shared';

/**
 * What the delivery view keeps on the phone, per route link: the last route data
 * and the changes not yet confirmed by the server. localStorage is plenty for a
 * route (a few kilobytes) and survives a closed tab or a dead battery.
 */
const dataKey = (token: string) => `zopf:route:${token}`;
const queueKey = (token: string) => `zopf:queue:${token}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the view still works online.
  }
}

export const loadRoute = (token: string) => read<{ data: DeliveryRoute; savedAt: string }>(dataKey(token));
export const saveRoute = (token: string, data: DeliveryRoute) => write(dataKey(token), { data, savedAt: new Date().toISOString() });
/** Removes everything kept for a route link (link expired or withdrawn). */
export function forgetRoute(token: string) {
  try {
    localStorage.removeItem(dataKey(token));
    localStorage.removeItem(queueKey(token));
  } catch {
    // Nothing kept, or storage blocked.
  }
}

export const loadQueue = (token: string) => read<DeliveryEvent[]>(queueKey(token)) ?? [];
export const saveQueue = (token: string, queue: DeliveryEvent[]) => write(queueKey(token), queue);

/** The same change the server makes (lib/delivery.ts), so the screen shows it at once, also offline. */
export function applyLocal(route: DeliveryRoute, event: DeliveryEvent): DeliveryRoute {
  return {
    ...route,
    stops: route.stops.map((s) => {
      if (s.orderId !== event.orderId) return s;
      if (event.field === 'delivery') return { ...s, deliveryStatus: event.value };
      if (event.field === 'note') return { ...s, deliveryNote: event.value || null };
      if (s.paymentStatus === 'PAID' && s.paidVia === 'BANK') return s;
      return event.value === 'OPEN' ? { ...s, paymentStatus: 'OPEN', paidVia: null } : { ...s, paymentStatus: 'PAID', paidVia: event.value };
    }),
  };
}

export function newEvent<F extends DeliveryEvent['field']>(orderId: number, field: F, value: Extract<DeliveryEvent, { field: F }>['value']): DeliveryEvent {
  return { clientEventId: crypto.randomUUID(), orderId, field, value, clientCreatedAt: new Date().toISOString() } as DeliveryEvent;
}

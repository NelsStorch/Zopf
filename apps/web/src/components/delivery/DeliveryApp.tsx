'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatChf, formatDate, translator, type DeliveryEvent, type DeliveryRoute, type Locale } from '@zopf/shared';
import { applyLocal, loadQueue, loadRoute, newEvent, saveQueue, saveRoute } from './offline-store';
import { TwintDialog } from './TwintDialog';

type Stop = DeliveryRoute['stops'][number];
type Filter = 'open' | 'all' | 'done';

const isDone = (s: Stop) => s.deliveryStatus !== 'PENDING';

/**
 * The route on the phone of a delivery team. Ticks are applied on screen at
 * once, kept on the phone and sent to the server in the background; without
 * reception they wait and go out as soon as there is a connection again.
 */
export function DeliveryApp({
  locale,
  token,
  initial,
  renderedAt,
}: {
  locale: Locale;
  token: string;
  initial: DeliveryRoute | null;
  renderedAt: string;
}) {
  const t = translator(locale);
  const chf = (r: number) => `CHF ${formatChf(r, locale)}`;
  const [route, setRoute] = useState<DeliveryRoute | null>(initial);
  const [queue, setQueue] = useState<DeliveryEvent[]>([]);
  const [online, setOnline] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string | null>(initial ? renderedAt : null);
  const [filter, setFilter] = useState<Filter>('open');
  const [twintFor, setTwintFor] = useState<Stop | null>(null);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const sending = useRef(false);
  const flushRef = useRef<(() => Promise<void>) | null>(null);

  // Start: the newer of the page's data and what the phone kept; then put the unsent changes on top.
  useEffect(() => {
    const kept = loadRoute(token);
    const pending = loadQueue(token);
    let base = initial;
    if (kept && (!initial || kept.savedAt > renderedAt)) {
      base = kept.data;
      setSyncedAt(kept.savedAt);
    } else if (initial) {
      saveRoute(token, initial);
    }
    if (base) setRoute(pending.reduce(applyLocal, base));
    setQueue(pending);
    setOnline(navigator.onLine);
    // The service worker keeps this page and its files on the phone for use without reception.
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    // Fresh data (and the other phone's ticks) right away when there is a connection.
    if (navigator.onLine) flushRef.current?.();
  }, [initial, renderedAt, token]);

  const flush = useCallback(async () => {
    if (sending.current) return;
    const pending = loadQueue(token);
    sending.current = true;
    try {
      const res = await fetch(pending.length ? `/api/v1/public/routes/${token}/events` : `/api/v1/public/routes/${token}`, {
        method: pending.length ? 'POST' : 'GET',
        headers: pending.length ? { 'Content-Type': 'application/json' } : undefined,
        body: pending.length ? JSON.stringify({ events: pending.slice(0, 200) }) : undefined,
        cache: 'no-store',
      });
      if (!res.ok) return;
      const body = await res.json();
      const fresh: DeliveryRoute = pending.length ? body.route : body;
      const accepted = new Set<string>(pending.length ? body.accepted : []);
      // Changes made while this request was on its way are still in the queue.
      const left = loadQueue(token).filter((e) => !accepted.has(e.clientEventId));
      saveQueue(token, left);
      saveRoute(token, fresh);
      setQueue(left);
      setRoute(left.reduce(applyLocal, fresh));
      setSyncedAt(new Date().toISOString());
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      sending.current = false;
    }
  }, [token]);
  flushRef.current = flush;

  useEffect(() => {
    const up = () => {
      setOnline(true);
      flush();
    };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    // Also picks up what the other phone of the team ticked.
    const timer = setInterval(() => document.visibilityState === 'visible' && flush(), 20_000);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      clearInterval(timer);
    };
  }, [flush]);

  function record(event: DeliveryEvent) {
    const next = [...loadQueue(token), event];
    saveQueue(token, next);
    setQueue(next);
    setRoute((r) => (r ? applyLocal(r, event) : r));
    flush();
  }

  const stops = route?.stops ?? [];
  const counts = { open: stops.filter((s) => !isDone(s)).length, done: stops.filter(isDone).length, all: stops.length };
  const visible = useMemo(() => stops.filter((s) => (filter === 'all' ? true : filter === 'done' ? isDone(s) : !isDone(s))), [stops, filter]);
  const next = stops.find((s) => !isDone(s));

  if (!route) return <p className="py-16 text-center text-lg">{t('delivery.invalid')}</p>;

  const collected = stops.filter((s) => s.paidVia === 'CASH' || s.paidVia === 'TWINT').reduce((sum, s) => sum + s.openRappen, 0);
  const toCollect = stops.filter((s) => s.paymentStatus === 'OPEN').reduce((sum, s) => sum + s.openRappen, 0);
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale === 'de' ? 'de-CH' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });

  return (
    <section className="space-y-4 py-4">
      <header className="space-y-1 rounded-2xl p-5 text-white" style={{ background: route.route.color }}>
        <h1 className="text-2xl font-bold">{t('delivery.title', { name: route.route.name })}</h1>
        <p className="text-sm opacity-90">
          {formatDate(route.campaign.deliveryDate, locale)}
          {route.campaign.deliveryTimeText && ` · ${route.campaign.deliveryTimeText}`}
        </p>
        <p className="text-lg font-semibold">{t('delivery.progress', { done: counts.done, total: counts.all })}</p>
        <div className="h-2 overflow-hidden rounded-full bg-white/30">
          <div className="h-full bg-white" style={{ width: `${counts.all ? (counts.done / counts.all) * 100 : 0}%` }} />
        </div>
        <p className="text-sm">
          {t('delivery.collected', { amount: chf(collected) })}
          {toCollect > 0 && ` · ${t('sheet.collectTotal', { amount: chf(toCollect) })}`}
        </p>
        {route.depot && (
          <p className="text-xs opacity-90">
            {t('sheet.start')}: {route.depot.name}, {route.depot.address}
          </p>
        )}
      </header>

      <div
        role="status"
        className={`flex items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm ${
          !online ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : queue.length ? 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
        }`}
      >
        <span>
          {!online && `${t('delivery.offline')} `}
          {queue.length ? t('delivery.pending', { count: queue.length }) : online ? t('delivery.synced') : ''}
          {syncedAt && <span className="ml-1 opacity-70">· {t('delivery.lastSync', { time: time(syncedAt) })}</span>}
        </span>
        <button type="button" onClick={flush} className="shrink-0 underline">
          {t('delivery.syncNow')}
        </button>
      </div>

      <div className="flex gap-2">
        {(['open', 'all', 'done'] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-full border px-3 py-2 text-sm font-semibold ${filter === f ? 'border-brand bg-brand text-on-brand' : 'border-zinc-300 dark:border-zinc-700'}`}
          >
            {t(f === 'open' ? 'delivery.filterOpen' : f === 'all' ? 'delivery.filterAll' : 'delivery.filterDone', { count: counts[f] })}
          </button>
        ))}
      </div>

      <ol className="space-y-3">
        {visible.map((stop) => (
          <StopCard
            key={stop.orderId}
            stop={stop}
            color={route.route.color}
            isNext={stop.orderId === next?.orderId}
            locale={locale}
            twint={!!route.twintPayload}
            noteOpen={noteFor === stop.orderId}
            onNote={() => setNoteFor(noteFor === stop.orderId ? null : stop.orderId)}
            onEvent={(event) => {
              record(event);
              if (event.field === 'note') setNoteFor(null);
            }}
            onTwint={() => setTwintFor(stop)}
          />
        ))}
      </ol>
      <p className="text-center text-xs text-zinc-500">{t('delivery.install')}</p>

      {twintFor && route.twintPayload && <TwintDialog locale={locale} payload={route.twintPayload} amount={chf(twintFor.openRappen)} onClose={() => setTwintFor(null)} />}
    </section>
  );
}

function StopCard({
  stop,
  color,
  isNext,
  locale,
  twint,
  noteOpen,
  onNote,
  onEvent,
  onTwint,
}: {
  stop: Stop;
  color: string;
  isNext: boolean;
  locale: Locale;
  twint: boolean;
  noteOpen: boolean;
  onNote: () => void;
  onEvent: (event: DeliveryEvent) => void;
  onTwint: () => void;
}) {
  const t = translator(locale);
  const chf = (r: number) => `CHF ${formatChf(r, locale)}`;
  const [note, setNote] = useState(stop.deliveryNote ?? '');
  const done = isDone(stop);
  const due = stop.paymentStatus === 'OPEN' && stop.openRappen > 0;
  const big = 'rounded-xl px-4 py-3 text-base font-semibold';

  return (
    <li className={`space-y-3 rounded-2xl border p-4 ${isNext ? 'border-brand ring-2 ring-brand' : 'border-zinc-200 dark:border-zinc-800'} ${done ? 'opacity-70' : ''}`}>
      {isNext && <p className="text-xs font-bold uppercase tracking-wide text-brand dark:text-sky-300">{t('delivery.next')}</p>}
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ background: color }}>
          {stop.seq}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-lg font-bold leading-tight">{stop.address}</p>
          <p>{stop.customerName}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{stop.items}</p>
          {stop.notes && <p className="text-sm italic">«{stop.notes}»</p>}
          {stop.deliveryNote && <p className="text-sm text-sky-700 dark:text-sky-300">✎ {stop.deliveryNote}</p>}
        </div>
      </div>

      {/* Payment */}
      {stop.paymentStatus === 'PAID' ? (
        <p className="text-sm font-semibold text-green-700 dark:text-green-400">
          {stop.paidVia === 'CASH' ? t('delivery.paidCash') : stop.paidVia === 'TWINT' ? t('delivery.paidTwint') : t('delivery.paidBank')}
          {(stop.paidVia === 'CASH' || stop.paidVia === 'TWINT') && (
            <button type="button" className="ml-3 text-xs font-normal underline" onClick={() => onEvent(newEvent(stop.orderId, 'payment', 'OPEN'))}>
              {t('delivery.undo')}
            </button>
          )}
        </p>
      ) : (
        due && (
          <div className="space-y-2 rounded-xl bg-amber-50 p-3 dark:bg-amber-950">
            <p className="text-lg font-bold">
              {stop.paymentMethod === 'QR_INVOICE' ? `${t('sheet.qrUnpaid')}: ${chf(stop.openRappen)}` : t('sheet.collect', { amount: chf(stop.openRappen) })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={`${big} bg-zinc-900 text-white dark:bg-white dark:text-zinc-900`} onClick={() => onEvent(newEvent(stop.orderId, 'payment', 'CASH'))}>
                {t('delivery.cash')}
              </button>
              <button type="button" className={`${big} bg-zinc-900 text-white dark:bg-white dark:text-zinc-900`} onClick={() => onEvent(newEvent(stop.orderId, 'payment', 'TWINT'))}>
                {t('delivery.twint')}
              </button>
            </div>
            {twint && (
              <button type="button" className="w-full text-sm underline" onClick={onTwint}>
                {t('delivery.showTwint')}
              </button>
            )}
          </div>
        )
      )}

      {/* Delivery */}
      {done ? (
        <p className={`flex items-center justify-between text-sm font-semibold ${stop.deliveryStatus === 'DELIVERED' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
          {stop.deliveryStatus === 'DELIVERED' ? t('delivery.statusDelivered') : t('delivery.statusNotHome')}
          <button type="button" className="text-xs font-normal underline" onClick={() => onEvent(newEvent(stop.orderId, 'delivery', 'PENDING'))}>
            {t('delivery.undo')}
          </button>
        </p>
      ) : (
        <div className="grid grid-cols-[2fr_1fr] gap-2">
          <button type="button" className={`${big} bg-green-600 text-white`} onClick={() => onEvent(newEvent(stop.orderId, 'delivery', 'DELIVERED'))}>
            {t('delivery.delivered')}
          </button>
          <button type="button" className={`${big} border border-zinc-300 dark:border-zinc-700`} onClick={() => onEvent(newEvent(stop.orderId, 'delivery', 'NOT_HOME'))}>
            {t('delivery.notHome')}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        {stop.lat !== null && stop.lng !== null && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 dark:border-zinc-700"
          >
            {t('delivery.navigate')}
          </a>
        )}
        {stop.phone && (
          <a href={`tel:${stop.phone.replace(/[^+\d]/g, '')}`} className="rounded-lg border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">
            {t('delivery.call')}
          </a>
        )}
        <button type="button" onClick={onNote} className="rounded-lg border border-zinc-300 px-3 py-1.5 dark:border-zinc-700" aria-expanded={noteOpen}>
          {t('delivery.note')}
        </button>
      </div>
      {noteOpen && (
        <form
          method="post"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onEvent(newEvent(stop.orderId, 'note', note.trim()));
          }}
        >
          <input
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('delivery.notePlaceholder')}
            aria-label={t('delivery.note')}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button type="submit" className="rounded-lg bg-brand px-3 py-2 font-semibold text-on-brand">
            {t('delivery.noteSave')}
          </button>
        </form>
      )}
    </li>
  );
}

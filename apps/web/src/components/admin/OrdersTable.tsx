'use client';

import { useMemo, useState } from 'react';
import { formatChf, formatDate, PAID_VIA, translator, type AdminOrderRow, type Locale, type PaidVia } from '@zopf/shared';
import { api, errorMessage } from '@/lib/client';
import { Button, inputClass, Notice } from './ui';

type Filter = 'all' | 'open' | 'paid' | 'pending' | 'cancelled';

const matches: Record<Filter, (o: AdminOrderRow) => boolean> = {
  all: () => true,
  open: (o) => o.status === 'CONFIRMED' && o.paymentStatus === 'OPEN',
  paid: (o) => o.status === 'CONFIRMED' && o.paymentStatus === 'PAID',
  pending: (o) => o.status === 'PENDING_CONFIRMATION',
  cancelled: (o) => o.status === 'CANCELLED',
};

/**
 * Orders of a campaign with what the team does with them before delivery day:
 * find an order, see the invoice, tick off payments (one by one or many at once
 * after going through the bank statement), and send payment reminders.
 */
export function OrdersTable({ locale, initial }: { locale: Locale; initial: AdminOrderRow[] }) {
  const t = translator(locale);
  const chf = (r: number) => `CHF ${formatChf(r, locale)}`;
  const [orders, setOrders] = useState(initial);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [via, setVia] = useState<PaidVia>('BANK');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (!matches[filter](o)) return false;
      if (!q) return true;
      const amount = formatChf(o.totalRappen, locale);
      return [o.number ?? '', o.customerName, o.address, o.email, o.phone ?? '', amount].some((v) => v.toLowerCase().includes(q));
    });
  }, [orders, filter, query, locale]);

  const confirmed = orders.filter((o) => o.status === 'CONFIRMED');
  const openSum = confirmed.filter((o) => o.paymentStatus === 'OPEN').reduce((s, o) => s + o.totalRappen, 0);

  const merge = (changed: AdminOrderRow[]) => setOrders((all) => all.map((o) => changed.find((c) => c.id === o.id) ?? o));

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function setPayment(order: AdminOrderRow, paid: boolean) {
    const result = await api<AdminOrderRow>(`/api/v1/admin/orders/${order.id}/payment`, 'PUT', paid ? { status: 'PAID', via } : { status: 'OPEN' });
    if (result.ok && result.data) merge([result.data]);
    else setNotice({ kind: 'error', text: errorMessage(locale, result) });
  }

  async function cancel(order: AdminOrderRow) {
    if (!window.confirm(t('orders.cancelConfirm', { number: order.number ?? order.customerName }))) return;
    const result = await api<AdminOrderRow>(`/api/v1/admin/orders/${order.id}/cancel`, 'POST');
    if (result.ok && result.data) merge([result.data]);
    else setNotice({ kind: 'error', text: errorMessage(locale, result) });
  }

  async function bulkPaid() {
    setBusy(true);
    const result = await api<{ updated: number; rows: AdminOrderRow[] }>('/api/v1/admin/orders/payments', 'POST', { ids: [...selected], via });
    setBusy(false);
    if (!result.ok || !result.data) return setNotice({ kind: 'error', text: errorMessage(locale, result) });
    merge(result.data.rows);
    setSelected(new Set());
    setNotice({ kind: 'ok', text: t('orders.paidDone', { count: result.data.updated }) });
  }

  async function reminders() {
    if (!window.confirm(t('orders.remindersConfirm', { count: selected.size }))) return;
    setBusy(true);
    const result = await api<{ sent: number; skipped: number; rows: AdminOrderRow[] }>('/api/v1/admin/orders/reminders', 'POST', { ids: [...selected] });
    setBusy(false);
    if (!result.ok || !result.data) return setNotice({ kind: 'error', text: errorMessage(locale, result) });
    merge(result.data.rows);
    setSelected(new Set());
    setNotice({ kind: 'ok', text: t('orders.remindersDone', { sent: result.data.sent, skipped: result.data.skipped }) });
  }

  const filters: Filter[] = ['all', 'open', 'paid', 'pending', 'cancelled'];
  const count = (f: Filter) => orders.filter(matches[f]).length;
  const day = (iso: string) => formatDate(iso, locale, false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-sm ${filter === f ? 'border-brand bg-brand text-on-brand' : 'border-zinc-300 dark:border-zinc-700'}`}
          >
            {t(`orders.filter.${f}`)} ({count(f)})
          </button>
        ))}
        <span className="ml-auto self-center text-sm font-semibold">{t('orders.openSum', { amount: chf(openSum) })}</span>
      </div>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('orders.search')} aria-label={t('orders.search')} className={inputClass} />

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={visible.length > 0 && visible.every((o) => selected.has(o.id))}
            onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((o) => o.id)) : new Set())}
          />
          {t('orders.selectAll')}
        </label>
        <span className="text-sm text-zinc-500">{t('orders.selected', { count: selected.size })}</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <select value={via} onChange={(e) => setVia(e.target.value as PaidVia)} aria-label={t('orders.col.payment')} className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
            {PAID_VIA.map((v) => (
              <option key={v} value={v}>
                {t(`orders.via.${v}`)}
              </option>
            ))}
          </select>
          <Button variant="primary" disabled={busy || selected.size === 0} onClick={bulkPaid}>
            {t('orders.markPaid')}
          </Button>
          <Button disabled={busy || selected.size === 0} onClick={reminders}>
            {t('orders.sendReminders')}
          </Button>
        </span>
      </div>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2">{t('orders.col.number')}</th>
              <th className="px-3 py-2">{t('orders.col.customer')}</th>
              <th className="px-3 py-2">{t('orders.col.items')}</th>
              <th className="px-3 py-2 text-right">{t('orders.col.total')}</th>
              <th className="px-3 py-2">{t('orders.col.payment')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {visible.map((o) => (
              <tr key={o.id} className={o.status === 'CONFIRMED' ? '' : 'text-zinc-400'}>
                <td className="px-3 py-2 align-top">
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} aria-label={o.number ?? o.customerName} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top font-mono">
                  {o.number ?? '—'}
                  {o.status !== 'CONFIRMED' && <span className="block font-sans text-xs">{t(o.status === 'CANCELLED' ? 'orders.cancelled' : 'orders.pending')}</span>}
                  {o.status !== 'CANCELLED' && o.paymentStatus === 'OPEN' && (
                    <button type="button" onClick={() => cancel(o)} className="mt-1 block font-sans text-xs text-red-700 underline dark:text-red-400">
                      {t('orders.cancel')}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <span className="font-medium">{o.customerName}</span>
                  <span className="block">{o.address}</span>
                  <span className="block text-xs text-zinc-500">
                    {o.email}
                    {o.phone && ` · ${o.phone}`}
                  </span>
                  {(o.addressManual || !o.hasLocation) && (
                    <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                      {[o.addressManual && t('orders.manual'), !o.hasLocation && t('orders.noLocation')].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {o.notes && <span className="block text-xs italic">«{o.notes}»</span>}
                </td>
                <td className="px-3 py-2 align-top">{o.items}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums">
                  {chf(o.totalRappen)}
                  {o.donationRappen > 0 && <span className="block text-xs text-zinc-500">♥ {chf(o.donationRappen)}</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top">
                  <span className="block">{t(o.paymentMethod === 'QR_INVOICE' ? 'orders.qr' : 'orders.onDelivery')}</span>
                  {o.status === 'CONFIRMED' && (
                    <>
                      <label className="mt-1 flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={o.paymentStatus === 'PAID'} onChange={(e) => setPayment(o, e.target.checked)} />
                        {o.paymentStatus === 'PAID' ? `${t('orders.paid')}${o.paidVia ? ` (${t(`orders.via.${o.paidVia}`)})` : ''}` : t('orders.open')}
                      </label>
                      {o.lastReminderAt && o.paymentStatus === 'OPEN' && (
                        <span className="block text-xs text-zinc-500">{t('orders.reminded', { date: day(o.lastReminderAt) })}</span>
                      )}
                      {o.paymentMethod === 'QR_INVOICE' && (
                        <a href={`/api/v1/admin/orders/${o.id}/invoice`} target="_blank" rel="noopener" className="block text-xs underline">
                          {t('orders.invoice')}
                        </a>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

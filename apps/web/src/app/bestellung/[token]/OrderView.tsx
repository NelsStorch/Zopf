'use client';

import { useState } from 'react';
import { formatChf, formatDate, translator, type Locale, type PublicCampaign, type PublicOrder } from '@zopf/shared';
import { formatAddress } from '@/components/AddressSearch';
import { OrderForm } from '@/components/order/OrderForm';
import { api, errorMessage } from '@/lib/client';

export function OrderView({
  locale,
  token,
  initial,
  campaign,
  justConfirmed,
}: {
  locale: Locale;
  token: string;
  initial: PublicOrder;
  campaign: PublicCampaign | null;
  justConfirmed: boolean;
}) {
  const t = translator(locale);
  const chf = (rappen: number) => `CHF ${formatChf(rappen, locale)}`;
  const [order, setOrder] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(justConfirmed ? { kind: 'ok', text: t('mail.confirmed.intro') } : null);
  const deadline = new Date(order.campaign.orderDeadline).toLocaleString(locale === 'de' ? 'de-CH' : 'en-GB', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Zurich',
  });

  async function cancel() {
    if (!window.confirm(t('order.view.cancelConfirm'))) return;
    const result = await api<PublicOrder>(`/api/v1/public/orders/${token}/cancel`, 'POST');
    if (result.ok && result.data) setOrder(result.data);
    else setNotice({ kind: 'error', text: errorMessage(locale, result) });
  }

  if (editing && campaign) {
    return (
      <section className="space-y-6 py-6">
        <h1 className="text-2xl font-bold">{t('order.view.edit')}</h1>
        <OrderForm
          locale={locale}
          campaign={campaign}
          existing={order}
          onSubmit={async (change) => {
            const result = await api<PublicOrder>(`/api/v1/public/orders/${token}`, 'PUT', change);
            if (!result.ok || !result.data) return errorMessage(locale, result);
            setOrder(result.data);
            setEditing(false);
            setNotice({ kind: 'ok', text: t('order.view.saved') });
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return null;
          }}
        />
        <button type="button" className="text-sm underline" onClick={() => setEditing(false)}>
          {t('common.cancel')}
        </button>
      </section>
    );
  }

  const row = 'flex justify-between gap-4 border-b border-zinc-200 py-2 dark:border-zinc-800';

  return (
    <section className="space-y-6 py-6">
      <h1 className="text-2xl font-bold">{t('order.view.title', { number: order.number ?? '' })}</h1>
      {notice && (
        <p role="status" className={`rounded-xl px-4 py-3 ${notice.kind === 'ok' ? 'bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-200' : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300'}`}>
          {notice.text}
        </p>
      )}
      {order.status === 'CANCELLED' && <p className="rounded-xl bg-zinc-100 px-4 py-3 dark:bg-zinc-900">{t('order.view.cancelled')}</p>}

      <div className="rounded-2xl bg-brand p-5 text-on-brand">
        <p className="font-semibold">{order.campaign.name}</p>
        <p>{t('mail.delivery', { date: formatDate(order.campaign.deliveryDate, locale) })}</p>
        {order.campaign.deliveryTimeText && <p className="opacity-90">{t('home.deliveryTime', { time: order.campaign.deliveryTimeText })}</p>}
      </div>

      <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-2 font-bold">{t('summary.items')}</h2>
        {order.items.map((item) => (
          <div key={`${item.productName}-${item.sizeLabel}`} className={row}>
            <span>
              {item.quantity} × {item.productName} {item.sizeLabel}
            </span>
            <span className="tabular-nums">{chf(item.quantity * item.unitPriceRappen)}</span>
          </div>
        ))}
        {order.donationRappen > 0 && (
          <div className={row}>
            <span>{t('summary.donation')} ♥</span>
            <span className="tabular-nums">{chf(order.donationRappen)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4 pt-2 text-lg font-bold">
          <span>{t('summary.total')}</span>
          <span className="tabular-nums">{chf(order.totalRappen)}</span>
        </div>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-zinc-500">{t('summary.address')}</dt>
          <dd>{formatAddress(order.address)}</dd>
          {order.notes && <dd className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">«{order.notes}»</dd>}
        </div>
        <div>
          <dt className="text-sm text-zinc-500">{t('order.view.contact')}</dt>
          <dd>{order.customerName}</dd>
          <dd className="text-sm">{order.email}</dd>
          {order.phone && <dd className="text-sm">{order.phone}</dd>}
        </div>
        <div>
          <dt className="text-sm text-zinc-500">{t('order.view.payment')}</dt>
          <dd>
            {t(order.paymentMethod === 'QR_INVOICE' ? 'order.payment.qr' : 'order.payment.onDelivery')} ·{' '}
            <strong>{t(order.paymentStatus === 'PAID' ? 'order.view.paid' : 'order.view.open')}</strong>
          </dd>
          {order.paymentMethod === 'QR_INVOICE' && order.status === 'CONFIRMED' && (
            <dd className="mt-1">
              <a href={`/api/v1/public/orders/${token}/invoice`} target="_blank" rel="noopener" className="text-sm underline">
                {t('invoice.download')}
              </a>
            </dd>
          )}
        </div>
      </dl>

      {order.status === 'CONFIRMED' &&
        (order.editable ? (
          <div className="space-y-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('mail.manageUntil', { date: deadline })}</p>
            <div className="flex flex-wrap gap-3">
              {campaign && (
                <button type="button" onClick={() => setEditing(true)} className="rounded-xl bg-brand px-5 py-2.5 font-semibold text-on-brand">
                  {t('order.view.edit')}
                </button>
              )}
              {order.paymentStatus !== 'PAID' && (
                <button type="button" onClick={cancel} className="rounded-xl border border-red-300 px-5 py-2.5 font-semibold text-red-700 dark:border-red-900 dark:text-red-400">
                  {t('order.view.cancel')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('order.view.locked')}</p>
        ))}
    </section>
  );
}

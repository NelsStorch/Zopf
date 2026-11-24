'use client';

import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import {
  donationSuggestions,
  formatChf,
  MAX_DONATION_RAPPEN,
  parseChf,
  translator,
  type AddressSuggestion,
  type Locale,
  type OrderChange,
  type PaymentMethod,
  type PublicCampaign,
  type PublicOrder,
} from '@zopf/shared';
import { AddressSearch, formatAddress } from '@/components/AddressSearch';

const input =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base dark:border-zinc-700 dark:bg-zinc-900 focus:outline-2 focus:outline-brand';

type AddressState =
  | { mode: 'directory'; picked: Pick<AddressSuggestion, 'id' | 'street' | 'houseNumber' | 'zip' | 'city'> | null }
  | { mode: 'manual'; street: string; houseNumber: string; zip: string; city: string };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The order form, for a new order and for changing one from the personal page.
 * Prices shown here are for orientation; the backend computes the real total.
 */
export function OrderForm({
  locale,
  campaign,
  existing,
  onSubmit,
}: {
  locale: Locale;
  campaign: PublicCampaign;
  /** Set when changing an order. */
  existing?: PublicOrder;
  onSubmit: (change: OrderChange, extra: { email: string; consent: boolean; website: string }) => Promise<string | null>;
}) {
  const t = translator(locale);
  const chf = (rappen: number) => `CHF ${formatChf(rappen, locale)}`;

  const [quantities, setQuantities] = useState<Record<number, number>>(() =>
    Object.fromEntries((existing?.items ?? []).filter((i) => i.sizeId !== null).map((i) => [i.sizeId!, i.quantity]))
  );
  const [donation, setDonation] = useState(existing?.donationRappen ?? 0);
  const [customDonation, setCustomDonation] = useState('');
  const [address, setAddress] = useState<AddressState>(() => {
    if (!existing) return { mode: 'directory', picked: null };
    const a = existing.address;
    return a.manual || a.addressId === null
      ? { mode: 'manual', street: a.street, houseNumber: a.houseNumber, zip: a.zip, city: a.city }
      : { mode: 'directory', picked: { id: a.addressId, street: a.street, houseNumber: a.houseNumber, zip: a.zip, city: a.city } };
  });
  const [payment, setPayment] = useState<PaymentMethod>(existing?.paymentMethod ?? (campaign.qrInvoiceAvailable ? 'QR_INVOICE' : 'ON_DELIVERY'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const prices = useMemo(() => new Map(campaign.products.flatMap((p) => p.sizes.map((s) => [s.id, s.priceRappen] as const))), [campaign]);
  const itemsRappen = Object.entries(quantities).reduce((sum, [id, q]) => sum + (prices.get(Number(id)) ?? 0) * q, 0);
  const pieces = Object.values(quantities).reduce((a, b) => a + b, 0);
  const suggestions = itemsRappen > 0 ? donationSuggestions(itemsRappen) : [500, 1000, 2000];

  const setQuantity = (sizeId: number, quantity: number) => setQuantities((q) => ({ ...q, [sizeId]: Math.max(0, Math.min(99, quantity)) }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const items = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([sizeId, quantity]) => ({ sizeId: Number(sizeId), quantity }));
    if (items.length === 0) return setError(t('order.empty'));
    if (address.mode === 'directory' && !address.picked) return setError(t('order.address.required'));

    const change: OrderChange = {
      items,
      donationRappen: donation,
      address:
        address.mode === 'directory'
          ? { kind: 'directory', addressId: address.picked!.id }
          : { kind: 'manual', street: address.street, houseNumber: address.houseNumber, zip: address.zip, city: address.city },
      customerName: String(form.get('customerName') ?? ''),
      phone: String(form.get('phone') ?? ''),
      notes: String(form.get('notes') ?? ''),
      paymentMethod: payment,
      reminderOptIn: form.get('reminderOptIn') === 'on',
      locale,
    };
    setBusy(true);
    const problem = await onSubmit(change, {
      email: String(form.get('email') ?? ''),
      consent: form.get('consent') === 'on',
      website: String(form.get('website') ?? ''),
    });
    setBusy(false);
    if (problem) setError(problem);
  }

  const chip = (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-semibold ${active ? 'border-brand bg-brand text-on-brand' : 'border-zinc-300 hover:border-brand dark:border-zinc-700'}`;

  return (
    <form method="post" onSubmit={submit} className="space-y-6">
      {/* Honeypot: invisible for people, filled in by bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Section title={t('order.products')}>
        {campaign.products.map((product) => (
          <div key={product.id} className="space-y-2">
            <div>
              <h3 className="font-bold">{product.name}</h3>
              {product.description && <p className="text-sm text-zinc-600 dark:text-zinc-400">{product.description}</p>}
            </div>
            {product.sizes.map((size) => {
              const q = quantities[size.id] ?? 0;
              return (
                <div key={size.id} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{size.label}</span>
                    <span className="block text-xs text-zinc-500">
                      {t('order.minPrice')} {chf(size.priceRappen)}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={`${t('order.less')}: ${product.name} ${size.label}`}
                    disabled={q === 0}
                    onClick={() => setQuantity(size.id, q - 1)}
                    className="h-10 w-10 rounded-full border border-zinc-300 text-xl leading-none disabled:opacity-30 dark:border-zinc-700"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99}
                    value={q}
                    aria-label={`${product.name} ${size.label}`}
                    onChange={(e) => setQuantity(size.id, Number(e.target.value) || 0)}
                    className="w-14 rounded-lg border border-zinc-300 bg-white py-2 text-center text-base tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <button
                    type="button"
                    aria-label={`${t('order.more')}: ${product.name} ${size.label}`}
                    onClick={() => setQuantity(size.id, q + 1)}
                    className="h-10 w-10 rounded-full bg-brand text-xl leading-none text-on-brand"
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </Section>

      <Section title={t('order.donation.title')}>
        <p className="text-zinc-700 dark:text-zinc-300">{t('order.donation.text')}</p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((amount) => {
            const roundsUp = itemsRappen > 0 && (itemsRappen + amount) % 500 === 0 && amount < 500;
            return (
              <button
                key={amount}
                type="button"
                aria-pressed={donation === amount && !customDonation}
                className={chip(donation === amount && !customDonation)}
                onClick={() => {
                  setDonation(amount);
                  setCustomDonation('');
                }}
              >
                {roundsUp ? t('order.donation.roundUp', { amount: chf(itemsRappen + amount) }) : t('order.donation.add', { amount: chf(amount) })}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={donation === 0}
            className={chip(donation === 0)}
            onClick={() => {
              setDonation(0);
              setCustomDonation('');
            }}
          >
            {t('order.donation.none')}
          </button>
        </div>
        <label className="block max-w-48 space-y-1">
          <span className="text-sm font-medium">{t('order.donation.custom')}</span>
          <input
            inputMode="decimal"
            value={customDonation}
            className={input}
            onChange={(e) => {
              setCustomDonation(e.target.value);
              const value = parseChf(e.target.value);
              setDonation(value === null ? 0 : Math.min(value, MAX_DONATION_RAPPEN));
            }}
          />
        </label>
        {donation > 0 && <p className="text-sm font-semibold text-brand dark:text-sky-300">{t('order.donation.thanks')}</p>}
      </Section>

      <Section title={t('order.address.title')}>
        {address.mode === 'directory' ? (
          <div className="space-y-3">
            {address.picked ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
                <span className="font-medium">✓ {formatAddress(address.picked)}</span>
                <button type="button" className="text-sm underline" onClick={() => setAddress({ mode: 'directory', picked: null })}>
                  {t('order.address.change')}
                </button>
              </div>
            ) : (
              <AddressSearch
                locale={locale}
                endpoint="/api/v1/public/addresses"
                inputClassName={input}
                onSelect={(picked) => setAddress({ mode: 'directory', picked })}
              />
            )}
            <button
              type="button"
              className="text-sm text-zinc-600 underline dark:text-zinc-400"
              onClick={() => setAddress({ mode: 'manual', street: '', houseNumber: '', zip: campaign.zipCodes[0] ?? '', city: '' })}
            >
              {t('order.address.missing')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('order.address.manualHint')}</p>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('order.address.street')}</span>
                <input required minLength={2} maxLength={120} autoComplete="address-line1" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('order.address.number')}</span>
                <input maxLength={20} value={address.houseNumber} onChange={(e) => setAddress({ ...address, houseNumber: e.target.value })} className={input} />
              </label>
            </div>
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              {/* biome-ignore lint/a11y/noLabelWithoutControl: select or input inside, depending on the area */}
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('order.address.zip')}</span>
                {campaign.zipCodes.length > 0 ? (
                  <select value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} className={input}>
                    {campaign.zipCodes.map((zip) => (
                      <option key={zip}>{zip}</option>
                    ))}
                  </select>
                ) : (
                  <input required pattern="\d{4}" inputMode="numeric" autoComplete="postal-code" value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} className={input} />
                )}
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('order.address.city')}</span>
                <input required minLength={2} maxLength={80} autoComplete="address-level2" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} className={input} />
              </label>
            </div>
            <button type="button" className="text-sm text-zinc-600 underline dark:text-zinc-400" onClick={() => setAddress({ mode: 'directory', picked: null })}>
              {t('order.address.backToSearch')}
            </button>
          </div>
        )}
      </Section>

      <Section title={t('order.contact.title')}>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t('order.contact.name')}</span>
          <input name="customerName" required minLength={2} maxLength={120} autoComplete="name" defaultValue={existing?.customerName} className={input} />
        </label>
        {existing ? (
          <p className="text-sm">
            <span className="text-zinc-500">{t('order.contact.email')}:</span> {existing.email}
          </p>
        ) : (
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('order.contact.email')}</span>
            <input name="email" type="email" required maxLength={200} autoComplete="email" className={input} />
            <span className="block text-xs text-zinc-500">{t('order.contact.emailHint')}</span>
          </label>
        )}
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t('order.contact.phone')}</span>
          <input name="phone" type="tel" maxLength={40} autoComplete="tel" defaultValue={existing?.phone ?? ''} className={input} />
          <span className="block text-xs text-zinc-500">{t('order.contact.phoneHint')}</span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t('order.contact.notes')}</span>
          <textarea name="notes" rows={2} maxLength={500} defaultValue={existing?.notes ?? ''} className={input} />
          <span className="block text-xs text-zinc-500">{t('order.contact.notesHint')}</span>
        </label>
      </Section>

      <Section title={t('order.payment.title')}>
        <fieldset className="space-y-2">
          <legend className="sr-only">{t('order.payment.title')}</legend>
          {(campaign.qrInvoiceAvailable ? (['QR_INVOICE', 'ON_DELIVERY'] as const) : (['ON_DELIVERY'] as const)).map((method) => (
            <label
              key={method}
              className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${payment === method ? 'border-brand ring-1 ring-brand' : 'border-zinc-300 dark:border-zinc-700'}`}
            >
              <input type="radio" name="paymentMethod" checked={payment === method} onChange={() => setPayment(method)} className="mt-1" />
              <span>
                <span className="block font-semibold">{t(method === 'QR_INVOICE' ? 'order.payment.qr' : 'order.payment.onDelivery')}</span>
                <span className="block text-sm text-zinc-600 dark:text-zinc-400">
                  {t(method === 'QR_INVOICE' ? 'order.payment.qrHint' : 'order.payment.onDeliveryHint')}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      </Section>

      <div className="space-y-3">
        <label className="flex gap-3 text-sm">
          <input name="reminderOptIn" type="checkbox" defaultChecked={existing?.reminderOptIn ?? false} className="mt-0.5" />
          {t('order.reminder')}
        </label>
        {!existing && (
          <label className="flex gap-3 text-sm">
            <input name="consent" type="checkbox" required className="mt-0.5" />
            <span>
              {t('order.consent', { privacy: '§' })
                .split('§')
                .flatMap((part, i) =>
                  i === 0
                    ? [part]
                    : [
                        <a key="p" href="/datenschutz" target="_blank" rel="noopener" className="underline">
                          {t('order.privacy')}
                        </a>,
                        part,
                      ]
                )}
            </span>
          </label>
        )}
      </div>

      <div className="sticky bottom-0 -mx-4 space-y-3 border-t border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-end justify-between gap-4">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('order.itemsTotal')}: {t('order.pieces', { count: pieces })} · {chf(itemsRappen)}
            {donation > 0 && (
              <>
                {' '}
                · {t('summary.donation')} {chf(donation)}
              </>
            )}
          </div>
          <div className="text-right">
            <span className="block text-xs text-zinc-500">{t('order.summary')}</span>
            <span className="whitespace-nowrap text-2xl font-bold tabular-nums">{chf(itemsRappen + donation)}</span>
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-brand px-4 py-3 text-lg font-bold text-on-brand disabled:opacity-60">
          {existing ? t('order.save') : t('order.submit')}
        </button>
      </div>
    </form>
  );
}

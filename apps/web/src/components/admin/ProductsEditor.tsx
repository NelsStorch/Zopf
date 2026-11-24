'use client';

import { type FormEvent, useState } from 'react';
import {
  formatChf,
  parseChf,
  translator,
  type AdminCampaign,
  type AdminProduct,
  type AdminSize,
  type Locale,
  type ProductInput,
  type SizeInput,
} from '@zopf/shared';
import { api, errorMessage, type ApiResult } from '@/lib/client';
import { Button, Field, inputClass, Notice } from './ui';

type Run = (call: Promise<ApiResult<AdminCampaign>>) => Promise<boolean>;

/** Products with their sizes. Every change returns the whole campaign, which replaces the page state. */
export function ProductsEditor({ locale, campaign, onChange }: { locale: Locale; campaign: AdminCampaign; onChange: (c: AdminCampaign) => void }) {
  const t = translator(locale);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const run: Run = async (call) => {
    setError(null);
    const result = await call;
    if (result.ok && result.data) {
      onChange(result.data);
      return true;
    }
    setError(errorMessage(locale, result));
    return false;
  };

  const move = (index: number, delta: number) => {
    const ids = campaign.products.map((p) => p.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    return run(api(`/api/v1/admin/campaigns/${campaign.id}/products/order`, 'PUT', { ids }));
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{t('products.title')}</h2>
        {!adding && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            {t('products.add')}
          </Button>
        )}
      </div>
      {error && <Notice kind="error">{error}</Notice>}

      {adding && (
        <div className="rounded-2xl border border-brand p-5">
          <ProductForm
            locale={locale}
            product={null}
            onCancel={() => setAdding(false)}
            onSubmit={async (input) => {
              if (await run(api(`/api/v1/admin/campaigns/${campaign.id}/products`, 'POST', input))) setAdding(false);
            }}
          />
        </div>
      )}

      {campaign.products.length === 0 && !adding && <p className="text-zinc-600 dark:text-zinc-400">{t('products.empty')}</p>}

      {campaign.products.map((product, index) => (
        <ProductCard
          key={product.id}
          locale={locale}
          product={product}
          run={run}
          onUp={index > 0 ? () => move(index, -1) : undefined}
          onDown={index < campaign.products.length - 1 ? () => move(index, 1) : undefined}
        />
      ))}
    </section>
  );
}

function ProductCard({
  locale,
  product,
  run,
  onUp,
  onDown,
}: {
  locale: Locale;
  product: AdminProduct;
  run: Run;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const t = translator(locale);
  const [editing, setEditing] = useState(false);
  const [addingSize, setAddingSize] = useState(false);
  const inUse = product.sizes.some((s) => s.inUse);

  const moveSize = (index: number, delta: number) => {
    const ids = product.sizes.map((s) => s.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    return run(api(`/api/v1/admin/products/${product.id}/sizes/order`, 'PUT', { ids }));
  };

  return (
    <article className={`space-y-4 rounded-2xl border p-5 ${product.isActive ? 'border-zinc-200 dark:border-zinc-800' : 'border-dashed border-zinc-300 opacity-70 dark:border-zinc-700'}`}>
      {editing ? (
        <ProductForm
          locale={locale}
          product={product}
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            if (await run(api(`/api/v1/admin/products/${product.id}`, 'PUT', input))) setEditing(false);
          }}
          onDelete={
            inUse
              ? undefined
              : async () => {
                  if (window.confirm(t('products.deleteConfirm'))) await run(api(`/api/v1/admin/products/${product.id}`, 'DELETE'));
                }
          }
        />
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold">
              {product.nameDe}
              {product.nameEn && <span className="font-normal text-zinc-500"> · {product.nameEn}</span>}
              {!product.isActive && <span className="ml-2 text-sm font-normal text-zinc-500">({t('products.inactive')})</span>}
            </h3>
            {product.descriptionDe && <p className="text-sm text-zinc-600 dark:text-zinc-400">{product.descriptionDe}</p>}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" onClick={onUp} disabled={!onUp} aria-label={t('products.up')} title={t('products.up')}>
              ↑
            </Button>
            <Button variant="ghost" onClick={onDown} disabled={!onDown} aria-label={t('products.down')} title={t('products.down')}>
              ↓
            </Button>
            <Button onClick={() => setEditing(true)}>{t('products.edit')}</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{t('sizes.title')}</h4>
        {product.sizes.length === 0 && <p className="text-sm text-amber-700 dark:text-amber-400">{t('sizes.none')}</p>}
        {product.sizes.map((size, index) => (
          <SizeRow
            key={size.id}
            locale={locale}
            size={size}
            onSave={(input) => run(api(`/api/v1/admin/sizes/${size.id}`, 'PUT', input))}
            onDelete={() => run(api(`/api/v1/admin/sizes/${size.id}`, 'DELETE'))}
            onUp={index > 0 ? () => moveSize(index, -1) : undefined}
            onDown={index < product.sizes.length - 1 ? () => moveSize(index, 1) : undefined}
          />
        ))}
        {addingSize ? (
          <SizeRow
            locale={locale}
            size={null}
            onSave={async (input) => {
              const ok = await run(api(`/api/v1/admin/products/${product.id}/sizes`, 'POST', input));
              if (ok) setAddingSize(false);
              return ok;
            }}
            onCancel={() => setAddingSize(false)}
          />
        ) : (
          <Button onClick={() => setAddingSize(true)}>{t('sizes.add')}</Button>
        )}
      </div>
    </article>
  );
}

function ProductForm({
  locale,
  product,
  onSubmit,
  onCancel,
  onDelete,
}: {
  locale: Locale;
  product: AdminProduct | null;
  onSubmit: (input: ProductInput) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const t = translator(locale);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    await onSubmit({
      nameDe: String(form.get('nameDe') ?? ''),
      nameEn: String(form.get('nameEn') ?? ''),
      descriptionDe: String(form.get('descriptionDe') ?? ''),
      descriptionEn: String(form.get('descriptionEn') ?? ''),
      isActive: form.get('isActive') === 'on',
    });
    setBusy(false);
  }

  return (
    <form method="post" onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('products.nameDe')}>
          <input name="nameDe" required maxLength={120} defaultValue={product?.nameDe ?? ''} className={inputClass} />
        </Field>
        <Field label={t('products.nameEn')}>
          <input name="nameEn" maxLength={120} defaultValue={product?.nameEn ?? ''} className={inputClass} />
        </Field>
        <Field label={t('products.descDe')}>
          <textarea name="descriptionDe" rows={2} maxLength={1000} defaultValue={product?.descriptionDe ?? ''} className={inputClass} />
        </Field>
        <Field label={t('products.descEn')}>
          <textarea name="descriptionEn" rows={2} maxLength={1000} defaultValue={product?.descriptionEn ?? ''} className={inputClass} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input name="isActive" type="checkbox" defaultChecked={product?.isActive ?? true} />
        {t('products.active')}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {t('common.save')}
        </Button>
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        {onDelete && (
          <Button variant="danger" className="ml-auto" onClick={onDelete}>
            {t('products.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}

/** One size as an inline form; the save button appears once something changed. */
function SizeRow({
  locale,
  size,
  onSave,
  onDelete,
  onCancel,
  onUp,
  onDown,
}: {
  locale: Locale;
  size: AdminSize | null;
  onSave: (input: SizeInput) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  onCancel?: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const t = translator(locale);
  const initial = {
    labelDe: size?.labelDe ?? '',
    labelEn: size?.labelEn ?? '',
    price: size ? formatChf(size.priceRappen) : '',
    isActive: size?.isActive ?? true,
  };
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = !size || JSON.stringify(values) !== JSON.stringify(initial);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const priceRappen = parseChf(values.price);
    if (priceRappen === null) {
      setError(t('error.price'));
      return;
    }
    setError(null);
    setBusy(true);
    const ok = await onSave({ labelDe: values.labelDe, labelEn: values.labelEn, priceRappen, isActive: values.isActive });
    setBusy(false);
    // Same spelling as the saved value ("12.5" -> "12.50"), so the row no longer counts as changed.
    if (ok && size) setValues({ ...values, labelDe: values.labelDe.trim(), labelEn: values.labelEn.trim(), price: formatChf(priceRappen) });
  }

  const small = `${inputClass} py-1.5 text-sm`;
  return (
    <form method="post" onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
      <label className="min-w-32 flex-1 space-y-1">
        <span className="text-xs text-zinc-500">{t('sizes.labelDe')}</span>
        <input required maxLength={60} value={values.labelDe} onChange={(e) => setValues({ ...values, labelDe: e.target.value })} className={small} />
      </label>
      <label className="min-w-32 flex-1 space-y-1">
        <span className="text-xs text-zinc-500">{t('sizes.labelEn')}</span>
        <input maxLength={60} value={values.labelEn} onChange={(e) => setValues({ ...values, labelEn: e.target.value })} className={small} />
      </label>
      <label className="w-28 space-y-1">
        <span className="text-xs text-zinc-500">{t('sizes.price')}</span>
        <input required inputMode="decimal" value={values.price} onChange={(e) => setValues({ ...values, price: e.target.value })} className={small} />
      </label>
      <label className="flex items-center gap-1.5 pb-2 text-sm">
        <input type="checkbox" checked={values.isActive} onChange={(e) => setValues({ ...values, isActive: e.target.checked })} />
        {t('products.active')}
      </label>
      <div className="flex gap-1">
        {dirty && (
          <Button type="submit" variant="primary" disabled={busy}>
            {t('common.save')}
          </Button>
        )}
        {onCancel && <Button onClick={onCancel}>{t('common.cancel')}</Button>}
        {size && (
          <>
            <Button variant="ghost" onClick={onUp} disabled={!onUp} aria-label={t('products.up')} title={t('products.up')}>
              ↑
            </Button>
            <Button variant="ghost" onClick={onDown} disabled={!onDown} aria-label={t('products.down')} title={t('products.down')}>
              ↓
            </Button>
            <Button
              variant="ghost"
              onClick={onDelete}
              disabled={size.inUse}
              aria-label={t('sizes.delete')}
              title={size.inUse ? t('sizes.inUseHint') : t('sizes.delete')}
            >
              ✕
            </Button>
          </>
        )}
      </div>
      {error && <p className="w-full text-sm text-red-700 dark:text-red-400">{error}</p>}
    </form>
  );
}

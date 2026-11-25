'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { formatChf, translator, type Locale, type Planning, type PlanningRoute, type PlanningStop, type RouteInput } from '@zopf/shared';
import { api, errorMessage, type ApiResult } from '@/lib/client';
import { PlanningMap } from './PlanningMap';
import { RouteHandover } from './RouteHandover';
import { Button, Field, inputClass, Notice } from './ui';

const bySeq = (a: PlanningStop, b: PlanningStop) => (a.routeSeq ?? 1e9) - (b.routeSeq ?? 1e9) || (a.number ?? '').localeCompare(b.number ?? '');

/**
 * Route planning: automatic split, then fine-tuning by hand. The map shows
 * every confirmed order; the side panel the selected stop, the routes with
 * their stops, and the orders that still need a route or a map point.
 */
export function PlanningBoard({ locale, initial }: { locale: Locale; initial: Planning }) {
  const t = translator(locale);
  const chf = (r: number) => `CHF ${formatChf(r, locale)}`;
  const [planning, setPlanning] = useState(initial);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [placing, setPlacing] = useState(false);
  const [openRoute, setOpenRoute] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const located = planning.depots.filter((d) => d.lat !== null);
  const [count, setCount] = useState(Math.max(1, planning.routes.length || Math.ceil(planning.stops.length / 15)));
  const [depotIds, setDepotIds] = useState<number[]>(located.map((d) => d.id));

  const selected = planning.stops.find((s) => s.orderId === selectedId) ?? null;
  const unassigned = planning.stops.filter((s) => s.routeId === null && s.lat !== null);
  const withoutPoint = planning.stops.filter((s) => s.lat === null);
  const stopsOf = useMemo(() => {
    const map = new Map<number, PlanningStop[]>();
    for (const r of planning.routes) map.set(r.id, planning.stops.filter((s) => s.routeId === r.id).sort(bySeq));
    return map;
  }, [planning]);

  async function run(call: Promise<ApiResult<Planning>>) {
    setBusy(true);
    setError(null);
    const result = await call;
    setBusy(false);
    if (result.ok && result.data) {
      setPlanning(result.data);
      return true;
    }
    setError(errorMessage(locale, result));
    return false;
  }

  async function autoPlan(event: FormEvent) {
    event.preventDefault();
    if (planning.routes.length > 0 && !window.confirm(t('planning.replaceConfirm'))) return;
    await run(api(`/api/v1/admin/campaigns/${planning.campaign.id}/planning/auto`, 'POST', { count, depotIds }));
  }

  const assign = (orderId: number, routeId: number | null) => run(api(`/api/v1/admin/orders/${orderId}/route`, 'PUT', { routeId }));

  async function place(lat: number, lng: number) {
    if (!selectedId) return;
    if (await run(api(`/api/v1/admin/orders/${selectedId}/location`, 'PUT', { lat, lng }))) setPlacing(false);
  }

  function move(route: PlanningRoute, index: number, delta: number) {
    const ids = (stopsOf.get(route.id) ?? []).map((s) => s.orderId);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    return run(api(`/api/v1/admin/routes/${route.id}/sequence`, 'PUT', { orderIds: ids }));
  }

  async function saveRoute(route: PlanningRoute, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const depot = String(form.get('depotId') ?? '');
    const input: RouteInput = {
      name: String(form.get('name') ?? ''),
      color: String(form.get('color') ?? route.color),
      leaders: String(form.get('leaders') ?? ''),
      depotId: depot ? Number(depot) : null,
    };
    if (await run(api(`/api/v1/admin/routes/${route.id}`, 'PUT', input))) setEditing(null);
  }

  const stopButton = (stop: PlanningStop, prefix?: string) => (
    <button
      type="button"
      onClick={() => {
        setSelectedId(stop.orderId);
        setPlacing(false);
      }}
      className={`min-w-0 flex-1 text-left ${stop.orderId === selectedId ? 'font-semibold' : ''}`}
    >
      {prefix && <span className="mr-1 tabular-nums text-zinc-500">{prefix}</span>}
      {stop.customerName} <span className="text-zinc-500">· {stop.address}</span>
      <span className="ml-1 text-xs text-zinc-500">({stop.pieces})</span>
    </button>
  );

  if (planning.stops.length === 0) return <p className="text-zinc-600 dark:text-zinc-400">{t('planning.empty')}</p>;

  return (
    <div className="space-y-4">
      <form onSubmit={autoPlan} method="post" className="flex flex-wrap items-end gap-4 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900">
        <Field label={t('planning.count')}>
          <input type="number" min={1} max={40} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} className={`${inputClass} w-24`} />
        </Field>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">{t('planning.depots')}</legend>
          {located.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">{t('planning.noDepots')}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {located.map((d) => (
                <label key={d.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={depotIds.includes(d.id)}
                    onChange={(e) => setDepotIds(e.target.checked ? [...depotIds, d.id] : depotIds.filter((x) => x !== d.id))}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <Button type="submit" variant="primary" disabled={busy || depotIds.length === 0}>
          {t('planning.run')}
        </Button>
        <span className="text-xs text-zinc-500">{t(planning.roadDistances ? 'planning.roadOn' : 'planning.roadOff')}</span>
      </form>
      {error && <Notice kind="error">{error}</Notice>}

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <div className="space-y-2">
          {placing && (
            <p role="status" className="flex items-center justify-between gap-3 rounded-xl bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {t('planning.placing')}
              <button type="button" className="underline" onClick={() => setPlacing(false)}>
                {t('planning.cancelPlacing')}
              </button>
            </p>
          )}
          <PlanningMap
            planning={planning}
            selectedId={selectedId}
            placing={placing}
            attribution={t('planning.mapAttribution')}
            onSelect={(id) => {
              setSelectedId(id);
              setPlacing(false);
            }}
            onPlace={place}
          />
        </div>

        <aside className="space-y-4">
          <section className="space-y-2 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            {selected ? (
              <>
                <p className="font-semibold">
                  {selected.number} · {selected.customerName}
                </p>
                <p className="text-sm">{selected.address}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{selected.items}</p>
                {selected.notes && <p className="text-sm italic">«{selected.notes}»</p>}
                {selected.openRappen > 0 && <p className="text-sm font-semibold">{t('planning.collect', { amount: chf(selected.openRappen) })}</p>}
                <label className="flex items-center gap-2 text-sm">
                  {t('planning.assignTo')}
                  <select
                    value={selected.routeId ?? ''}
                    disabled={busy}
                    onChange={(e) => assign(selected.orderId, e.target.value ? Number(e.target.value) : null)}
                    className="flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="">{t('planning.none')}</option>
                    {planning.routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button onClick={() => setPlacing(true)} disabled={placing}>
                  {selected.lat === null ? t('planning.placePin') : t('planning.movePin')}
                </Button>
              </>
            ) : (
              <p className="text-sm text-zinc-500">{t('planning.selectHint')}</p>
            )}
          </section>

          {withoutPoint.length > 0 && (
            <section className="space-y-1 rounded-2xl border border-amber-300 p-4 dark:border-amber-800">
              <h2 className="font-bold">{t('planning.noLocation', { count: withoutPoint.length })}</h2>
              <p className="text-xs text-zinc-500">{t('planning.noLocationHint')}</p>
              {withoutPoint.map((s) => (
                <div key={s.orderId} className="flex text-sm">
                  {stopButton(s)}
                </div>
              ))}
            </section>
          )}

          {unassigned.length > 0 && (
            <section className="space-y-1 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="font-bold">{t('planning.unassigned', { count: unassigned.length })}</h2>
              {unassigned.map((s) => (
                <div key={s.orderId} className="flex text-sm">
                  {stopButton(s)}
                </div>
              ))}
            </section>
          )}

          {planning.routes.map((route) => {
            const stops = stopsOf.get(route.id) ?? [];
            const open = openRoute === route.id;
            return (
              <section key={route.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-800" style={{ borderLeft: `6px solid ${route.color}` }}>
                <button type="button" className="w-full p-4 text-left" onClick={() => setOpenRoute(open ? null : route.id)} aria-expanded={open}>
                  <span className="block font-bold">
                    {route.name} {route.released && <span className="text-xs font-normal text-zinc-500">({t('planning.released')})</span>}
                  </span>
                  <span className="block text-sm text-zinc-600 dark:text-zinc-400">
                    {t('planning.stops', { count: route.stops })} · {route.pieces} × · {t('planning.length', { km: (route.lengthMeters / 1000).toFixed(1) })}
                    {route.openRappen > 0 && ` · ${t('planning.collect', { amount: chf(route.openRappen) })}`}
                  </span>
                  {route.leaders && <span className="block text-xs text-zinc-500">{route.leaders}</span>}
                </button>
                {open && (
                  <div className="space-y-3 border-t border-zinc-200 p-4 dark:border-zinc-800">
                    <RouteHandover locale={locale} route={route} busy={busy} run={run} />
                    {editing === route.id ? (
                      <form method="post" onSubmit={(e) => saveRoute(route, e)} className="space-y-2">
                        <div className="grid grid-cols-[1fr_4rem] gap-2">
                          <Field label={t('planning.name')}>
                            <input name="name" required maxLength={80} defaultValue={route.name} className={inputClass} />
                          </Field>
                          <Field label={t('planning.color')}>
                            <input name="color" type="color" defaultValue={route.color} className="h-10 w-full rounded-lg" />
                          </Field>
                        </div>
                        <Field label={t('planning.leaders')}>
                          <input name="leaders" maxLength={200} defaultValue={route.leaders ?? ''} className={inputClass} />
                        </Field>
                        <Field label={t('planning.depot')}>
                          <select name="depotId" defaultValue={route.depotId ?? ''} className={inputClass}>
                            <option value="">{t('planning.none')}</option>
                            {planning.depots.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <div className="flex gap-2">
                          <Button type="submit" variant="primary" disabled={busy}>
                            {t('common.save')}
                          </Button>
                          <Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => setEditing(route.id)}>{t('planning.edit')}</Button>
                        <Button disabled={busy} onClick={() => run(api(`/api/v1/admin/routes/${route.id}/optimize`, 'POST'))}>
                          {t('planning.optimize')}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() => window.confirm(t('planning.deleteConfirm')) && run(api(`/api/v1/admin/routes/${route.id}`, 'DELETE'))}
                        >
                          {t('planning.deleteRoute')}
                        </Button>
                      </div>
                    )}
                    <ol className="space-y-1">
                      {stops.map((s, index) => (
                        <li key={s.orderId} className="flex items-center gap-1 text-sm">
                          {stopButton(s, `${index + 1}.`)}
                          <button type="button" aria-label="↑" disabled={busy || index === 0} onClick={() => move(route, index, -1)} className="px-1 disabled:opacity-30">
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label="↓"
                            disabled={busy || index === stops.length - 1}
                            onClick={() => move(route, index, 1)}
                            className="px-1 disabled:opacity-30"
                          >
                            ↓
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </section>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run(api(`/api/v1/admin/campaigns/${planning.campaign.id}/routes`, 'POST'))} disabled={busy}>
              {t('planning.addRoute')}
            </Button>
            {planning.routes.some((r) => r.link) && (
              <a
                href={`/api/v1/admin/campaigns/${planning.campaign.id}/sheets.pdf`}
                target="_blank"
                rel="noopener"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700"
              >
                {t('sheet.all')}
              </a>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

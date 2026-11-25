'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import type { Planning } from '@zopf/shared';
import 'leaflet/dist/leaflet.css';

/** swisstopo national map (colour), Web Mercator tiles. */
const TILE_URL = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg';
const UNASSIGNED = '#71717a';

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Map of the planning: start points as squares, stops as numbered dots in the
 * colour of their route (grey = not assigned), each route as a thin line in its
 * order. Click a stop to select it; in placing mode a click on the map sets the
 * position of the selected order.
 */
export function PlanningMap({
  planning,
  selectedId,
  placing,
  attribution,
  onSelect,
  onPlace,
}: {
  planning: Planning;
  selectedId: number | null;
  placing: boolean;
  attribution: string;
  onSelect: (orderId: number) => void;
  onPlace: (lat: number, lng: number) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const handlers = useRef({ onSelect, onPlace, placing });
  handlers.current = { onSelect, onPlace, placing };
  const fitted = useRef(false);

  // Create the map once (Leaflet needs the browser, so it is loaded here).
  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((L) => {
      if (cancelled || !element.current || map.current) return;
      const m = L.map(element.current, { zoomControl: true }).setView([46.8, 8.2], 8);
      L.tileLayer(TILE_URL, { maxZoom: 19, maxNativeZoom: 18, attribution }).addTo(m);
      m.on('click', (e) => {
        if (handlers.current.placing) handlers.current.onPlace(e.latlng.lat, e.latlng.lng);
      });
      map.current = m;
      layer.current = L.layerGroup().addTo(m);
      // Draw what is already there.
      element.current.dispatchEvent(new Event('zopf:ready'));
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [attribution]);

  // Redraw markers and lines whenever the planning or the selection changes.
  useEffect(() => {
    const draw = () =>
      import('leaflet').then((L) => {
        const m = map.current;
        const group = layer.current;
        if (!m || !group) return;
        group.clearLayers();
        const colors = new Map(planning.routes.map((r) => [r.id, r.color]));
        const bounds: [number, number][] = [];

        for (const route of planning.routes) {
          const depot = planning.depots.find((d) => d.id === route.depotId);
          const stops = planning.stops
            .filter((s) => s.routeId === route.id && s.lat !== null && s.lng !== null)
            .sort((a, b) => (a.routeSeq ?? 1e9) - (b.routeSeq ?? 1e9));
          const line: [number, number][] = [
            ...(depot?.lat != null && depot.lng != null ? [[depot.lat, depot.lng] as [number, number]] : []),
            ...stops.map((s) => [s.lat!, s.lng!] as [number, number]),
          ];
          if (line.length > 1) L.polyline(line, { color: route.color, weight: 3, opacity: 0.6 }).addTo(group);
        }

        for (const depot of planning.depots) {
          if (depot.lat === null || depot.lng === null) continue;
          bounds.push([depot.lat, depot.lng]);
          L.marker([depot.lat, depot.lng], {
            icon: L.divIcon({
              className: '',
              html: '<div style="width:22px;height:22px;background:#18181b;border:3px solid #fff;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
              iconSize: [22, 22],
              iconAnchor: [11, 11],
            }),
            zIndexOffset: 1000,
          })
            .bindTooltip(escapeHtml(depot.name))
            .addTo(group);
        }

        for (const stop of planning.stops) {
          if (stop.lat === null || stop.lng === null) continue;
          bounds.push([stop.lat, stop.lng]);
          const color = stop.routeId ? (colors.get(stop.routeId) ?? UNASSIGNED) : UNASSIGNED;
          const selected = stop.orderId === selectedId;
          const label = stop.routeId && stop.routeSeq ? String(stop.routeSeq) : '';
          const size = selected ? 30 : 24;
          L.marker([stop.lat, stop.lng], {
            icon: L.divIcon({
              className: '',
              html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#fff;font:700 11px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;border:${selected ? 4 : 2}px solid ${selected ? '#facc15' : '#fff'};box-shadow:0 1px 4px rgba(0,0,0,.5)">${label}</div>`,
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            }),
            zIndexOffset: selected ? 2000 : 0,
          })
            .bindTooltip(`${escapeHtml(stop.number ?? '')} ${escapeHtml(stop.customerName)}<br>${escapeHtml(stop.address)}<br>${stop.pieces} ×`)
            .on('click', () => handlers.current.onSelect(stop.orderId))
            .addTo(group);
        }

        if (!fitted.current && bounds.length) {
          m.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
          fitted.current = true;
        }
      });
    draw();
    const el = element.current;
    el?.addEventListener('zopf:ready', draw);
    return () => el?.removeEventListener('zopf:ready', draw);
  }, [planning, selectedId]);

  // Leaflet adds its own classes to the map element; React must never re-render that
  // element's className, so the changing style sits on a wrapper.
  return (
    <div
      className={`h-[65vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 ${placing ? '[&_.leaflet-container]:cursor-crosshair' : ''}`}
    >
      <div ref={element} role="application" aria-label="Karte" className="h-full w-full" />
    </div>
  );
}

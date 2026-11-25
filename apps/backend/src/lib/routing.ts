/**
 * Route planning without paid services.
 *
 * 1. cluster: balanced k-means on the map. Each group gets about the same number
 *    of pieces (not stops), so no team carries twice as many crates.
 * 2. sequence: per route, nearest neighbour from the start point, improved with
 *    2-opt. The route is open (it does not return to the start).
 *
 * Distances are straight lines (haversine) unless a distance matrix is given,
 * e.g. from an own OSRM server (see osrmMatrix).
 */

export interface Point {
  lat: number;
  lng: number;
}

export interface Stop extends Point {
  id: number;
  /** Pieces to deliver; the balance is about these. */
  weight: number;
}

/** Metres between two points on the earth. */
export function haversine(a: Point, b: Point): number {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Small deterministic random generator, so the same input gives the same plan. */
function random(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4_294_967_296;
  };
}

const centroid = (points: Point[]): Point => ({
  lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
  lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
});

/**
 * Splits the stops into k compact groups of about equal weight. Returns the
 * group index per stop (same order as the input). Groups may stay empty when
 * there are fewer stops than groups.
 *
 * Assignment respects a capacity of total/k * (1 + slack): stops are placed in
 * order of how much they prefer their nearest centre over the next one, so the
 * stops with a clear home go first and the border cases fill up the rest.
 */
export function balancedClusters(stops: Stop[], k: number, slack = 0.15, iterations = 30): number[] {
  if (stops.length === 0 || k <= 0) return [];
  if (k === 1) return stops.map(() => 0);
  const rnd = random(stops.length * 7919 + k);

  // k-means++ start: spread the centres out.
  const centres: Point[] = [stops[Math.floor(rnd() * stops.length)]];
  while (centres.length < Math.min(k, stops.length)) {
    const d2 = stops.map((s) => Math.min(...centres.map((c) => haversine(s, c))) ** 2);
    const sum = d2.reduce((a, b) => a + b, 0);
    let pick = rnd() * sum;
    let index = 0;
    while (index < d2.length - 1 && pick > d2[index]) pick -= d2[index++];
    centres.push(stops[index]);
  }
  while (centres.length < k) centres.push(centres[0]);

  const total = stops.reduce((s, p) => s + Math.max(1, p.weight), 0);
  const capacity = (total / k) * (1 + slack);
  let assignment: number[] = stops.map(() => 0);

  for (let iter = 0; iter < iterations; iter++) {
    const distances = stops.map((s) => centres.map((c) => haversine(s, c)));
    const order = stops
      .map((_, i) => {
        const sorted = [...distances[i]].sort((a, b) => a - b);
        return { i, regret: (sorted[1] ?? sorted[0]) - sorted[0] };
      })
      .sort((a, b) => b.regret - a.regret);
    const load = new Array(k).fill(0);
    const next = new Array<number>(stops.length);
    for (const { i } of order) {
      const weight = Math.max(1, stops[i].weight);
      const choices = distances[i].map((d, g) => ({ g, d })).sort((a, b) => a.d - b.d);
      // The nearest group with room; if all are full, the least loaded one.
      const choice = choices.find((c) => load[c.g] + weight <= capacity) ?? choices.reduce((a, b) => (load[a.g] <= load[b.g] ? a : b));
      next[i] = choice.g;
      load[choice.g] += weight;
    }
    const changed = next.some((g, i) => g !== assignment[i]);
    assignment = next;
    for (let g = 0; g < k; g++) {
      const members = stops.filter((_, i) => assignment[i] === g);
      if (members.length) centres[g] = centroid(members);
    }
    if (!changed && iter > 0) break;
  }
  return assignment;
}

/** Distance between two indices: 0 is the start, 1..n the stops. */
export type Distance = (a: number, b: number) => number;

export function straightLine(start: Point, stops: Point[]): Distance {
  const all = [start, ...stops];
  return (a, b) => haversine(all[a], all[b]);
}

const pathLength = (path: number[], dist: Distance) => path.reduce((s, v, i) => (i === 0 ? s : s + dist(path[i - 1], v)), 0);

/**
 * Order of visit for one route: indices 0..n-1 into `stops`. Starts at index 0
 * of the distance function (the start point), goes to the nearest stop next,
 * then improves the open path with 2-opt until nothing gets shorter.
 */
export function sequence(count: number, dist: Distance): number[] {
  if (count <= 1) return count === 1 ? [0] : [];
  const left = new Set(Array.from({ length: count }, (_, i) => i + 1));
  const path = [0];
  while (left.size) {
    const last = path[path.length - 1];
    let best = -1;
    for (const c of left) if (best < 0 || dist(last, c) < dist(last, best)) best = c;
    path.push(best);
    left.delete(best);
  }
  // 2-opt on the open path (index 0, the start, stays fixed).
  let improved = true;
  for (let round = 0; improved && round < 50; round++) {
    improved = false;
    for (let i = 1; i < path.length - 1; i++) {
      for (let j = i + 1; j < path.length; j++) {
        const before = dist(path[i - 1], path[i]) + (j + 1 < path.length ? dist(path[j], path[j + 1]) : 0);
        const after = dist(path[i - 1], path[j]) + (j + 1 < path.length ? dist(path[i], path[j + 1]) : 0);
        if (after + 1e-6 < before) {
          path.splice(i, j - i + 1, ...path.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return path.slice(1).map((p) => p - 1);
}

export { pathLength };

/**
 * Walking distances from an own OSRM server (OSRM_URL), for the order within a
 * route. Returns null on any problem; the caller then uses straight lines.
 */
export async function osrmMatrix(baseUrl: string, start: Point, stops: Point[], profile = 'foot'): Promise<Distance | null> {
  if (stops.length === 0 || stops.length > 300) return null;
  const coords = [start, ...stops].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/table/v1/${profile}/${coords}?annotations=distance`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { code?: string; distances?: (number | null)[][] };
    const m = body.distances;
    if (body.code !== 'Ok' || !m) return null;
    const fallback = straightLine(start, stops);
    return (a, b) => m[a]?.[b] ?? fallback(a, b);
  } catch {
    return null;
  }
}

/** Distinct colours for routes, readable as pins and as text. */
export const ROUTE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#7c3aed', '#ea580c', '#0d9488', '#4f46e5'];

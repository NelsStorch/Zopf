import { describe, expect, it } from 'vitest';
import { balancedClusters, haversine, pathLength, sequence, straightLine, type Stop } from './routing.js';

/** A grid of stops around a made-up village; the coordinates only need to be plausible. */
function grid(n: number, base = { lat: 47.4, lng: 8.7 }, step = 0.002): Stop[] {
  const stops: Stop[] = [];
  for (let i = 0; i < n; i++) stops.push({ id: i + 1, lat: base.lat + (i % 10) * step, lng: base.lng + Math.floor(i / 10) * step, weight: 1 });
  return stops;
}

describe('haversine', () => {
  it('measures about 111 km per degree of latitude', () => {
    expect(haversine({ lat: 47, lng: 8 }, { lat: 48, lng: 8 })).toBeGreaterThan(111_000);
    expect(haversine({ lat: 47, lng: 8 }, { lat: 48, lng: 8 })).toBeLessThan(111_400);
  });
});

describe('balancedClusters', () => {
  it('splits two distant villages apart', () => {
    const a = grid(20, { lat: 47.4, lng: 8.7 });
    const b = grid(20, { lat: 47.5, lng: 8.9 }).map((s) => ({ ...s, id: s.id + 100 }));
    const groups = balancedClusters([...a, ...b], 2);
    const ga = new Set(groups.slice(0, 20));
    const gb = new Set(groups.slice(20));
    expect(ga.size).toBe(1);
    expect(gb.size).toBe(1);
    expect([...ga][0]).not.toBe([...gb][0]);
  });

  it('keeps the pieces per group close to equal', () => {
    const stops = grid(60).map((s, i) => ({ ...s, weight: 1 + (i % 4) }));
    const groups = balancedClusters(stops, 4);
    const load = [0, 0, 0, 0];
    stops.forEach((s, i) => {
      load[groups[i]] += s.weight;
    });
    const total = load.reduce((a, b) => a + b, 0);
    for (const l of load) expect(l).toBeLessThanOrEqual((total / 4) * 1.2);
  });

  it('is deterministic and copes with more groups than stops', () => {
    const stops = grid(30);
    expect(balancedClusters(stops, 3)).toEqual(balancedClusters(stops, 3));
    expect(balancedClusters(grid(2), 5)).toHaveLength(2);
    expect(balancedClusters([], 3)).toEqual([]);
  });
});

describe('sequence', () => {
  it('visits every stop once and walks a line in order', () => {
    const start = { lat: 47.4, lng: 8.7 };
    const line = [5, 1, 4, 2, 3].map((k) => ({ lat: 47.4 + k * 0.001, lng: 8.7 }));
    const order = sequence(line.length, straightLine(start, line));
    expect(order.map((i) => line[i].lat)).toEqual([...line.map((p) => p.lat)].sort((a, b) => a - b));
  });

  it('is never longer than nearest neighbour alone (2-opt only improves)', () => {
    const start = { lat: 47.4, lng: 8.7 };
    const stops = grid(40);
    const dist = straightLine(start, stops);
    const order = sequence(stops.length, dist);
    expect(new Set(order).size).toBe(40);
    const visited = [0, ...order.map((i) => i + 1)];
    const inInputOrder = [0, ...stops.map((_, i) => i + 1)];
    expect(pathLength(visited, dist)).toBeLessThanOrEqual(pathLength(inInputOrder, dist));
  });
});

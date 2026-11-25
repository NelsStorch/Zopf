import { describe, expect, it } from 'vitest';
import { linkValidUntil, routeToken } from './route-links.js';

describe('route links', () => {
  it('gives the same token for the same release, a different one after a new release', () => {
    const at = new Date('2027-03-01T10:00:00Z');
    expect(routeToken(7, at)).toBe(routeToken(7, at));
    expect(routeToken(7, at)).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(routeToken(7, new Date(at.getTime() + 1))).not.toBe(routeToken(7, at));
    expect(routeToken(8, at)).not.toBe(routeToken(7, at));
  });

  it('works until the end of the second day after delivery', () => {
    const until = linkValidUntil(new Date('2027-03-13T00:00:00Z'));
    expect(until.toISOString()).toBe('2027-03-15T23:59:59.999Z');
  });
});

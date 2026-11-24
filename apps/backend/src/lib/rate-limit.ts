/**
 * Fixed-window counter per key (usually the IP) for public endpoints, in
 * memory like the login lock. Traefik limits the raw request rate in front.
 */
export function rateLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const windows = new Map<string, { start: number; count: number }>();
  const sweep = setInterval(() => {
    const t = now();
    for (const [key, w] of windows) if (t - w.start > windowMs) windows.delete(key);
  }, windowMs);
  sweep.unref();

  /** true = allowed, false = over the limit for this window. */
  return (key: string): boolean => {
    const t = now();
    const w = windows.get(key);
    if (!w || t - w.start > windowMs) {
      windows.set(key, { start: t, count: 1 });
      return true;
    }
    w.count++;
    return w.count <= max;
  };
}

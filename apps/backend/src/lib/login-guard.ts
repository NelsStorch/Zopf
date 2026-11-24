/**
 * Counts failed logins under a key and locks the key once there are too many
 * within the window. In memory: enough for a single backend container
 * (a restart lifts running locks, see docs/betrieb.md).
 */
export function failureCounter(max: number, windowMs: number, lockMs: number, now: () => number = Date.now) {
  const entries = new Map<string, { count: number; firstAt: number; lockedUntil?: number }>();

  const sweep = setInterval(() => {
    const t = now();
    for (const [key, entry] of entries) {
      if (entry.lockedUntil ? entry.lockedUntil < t : t - entry.firstAt > windowMs) entries.delete(key);
    }
  }, 5 * 60 * 1000);
  sweep.unref();

  return {
    /** Milliseconds until the key is free again, 0 when it is not locked. */
    lockedFor(key: string): number {
      const entry = entries.get(key);
      if (!entry?.lockedUntil) return 0;
      const rest = entry.lockedUntil - now();
      if (rest <= 0) {
        entries.delete(key);
        return 0;
      }
      return rest;
    },
    record(key: string) {
      const t = now();
      const entry = entries.get(key);
      if (!entry || t - entry.firstAt > windowMs) {
        entries.set(key, { count: 1, firstAt: t });
        return;
      }
      entry.count++;
      if (entry.count >= max) entry.lockedUntil = t + lockMs;
    },
    clear(key: string) {
      entries.delete(key);
    },
  };
}

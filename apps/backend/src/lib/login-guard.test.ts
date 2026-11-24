import { describe, expect, it } from 'vitest';
import { failureCounter } from './login-guard.js';

describe('failureCounter', () => {
  it('locks a key after too many failures and frees it after the lock time', () => {
    let t = 0;
    const counter = failureCounter(3, 60_000, 10_000, () => t);
    counter.record('a');
    counter.record('a');
    expect(counter.lockedFor('a')).toBe(0);
    counter.record('a');
    expect(counter.lockedFor('a')).toBe(10_000);
    t = 10_001;
    expect(counter.lockedFor('a')).toBe(0);
  });

  it('starts counting anew after the window', () => {
    let t = 0;
    const counter = failureCounter(2, 1_000, 5_000, () => t);
    counter.record('a');
    t = 2_000;
    counter.record('a');
    expect(counter.lockedFor('a')).toBe(0);
  });

  it('forgets a key after a successful login', () => {
    const counter = failureCounter(2, 60_000, 5_000);
    counter.record('a');
    counter.clear('a');
    counter.record('a');
    expect(counter.lockedFor('a')).toBe(0);
  });
});

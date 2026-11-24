import { describe, expect, it } from 'vitest';
import { hashToken, newToken } from './tokens.js';

describe('tokens', () => {
  it('stores only a hash that matches the token', () => {
    const { token, hash } = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
  });

  it('makes a different token every time', () => {
    expect(newToken().token).not.toBe(newToken().token);
  });
});

import crypto from 'crypto';

/**
 * Secret links (order confirmation, personal order page, route link) carry a
 * random token. Only its sha256 is stored, so a leaked database does not open
 * any link; a lost link is replaced by a new one.
 */
export function newToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(24).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

import fs from 'fs/promises';
import path from 'path';
import { DEFAULT_LOGO_SVG } from '@zopf/shared';
import { brandingDir } from '@/lib/brand';

/**
 * /brand/logo and /brand/favicon: the club's own files from the branding
 * folder (volume), otherwise the default logo. Fixed file names only, so the
 * URL cannot reach anything else on the disk.
 */
const CANDIDATES: Record<string, { file: string; type: string }[]> = {
  logo: [
    { file: 'logo.svg', type: 'image/svg+xml' },
    { file: 'logo.png', type: 'image/png' },
  ],
  favicon: [
    { file: 'favicon.ico', type: 'image/x-icon' },
    { file: 'logo.svg', type: 'image/svg+xml' },
    { file: 'logo.png', type: 'image/png' },
  ],
};

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const candidates = CANDIDATES[asset];
  if (!candidates) return new Response('Not found', { status: 404 });

  const headers = { 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' };
  for (const { file, type } of candidates) {
    try {
      const body = await fs.readFile(path.join(brandingDir(), file));
      // An SVG may not run scripts when opened on its own.
      const extra: Record<string, string> =
        type === 'image/svg+xml' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {};
      return new Response(new Uint8Array(body), { headers: { ...headers, ...extra, 'Content-Type': type } });
    } catch {
      // Not there: try the next one.
    }
  }
  return new Response(DEFAULT_LOGO_SVG, { headers: { ...headers, 'Content-Type': 'image/svg+xml' } });
}

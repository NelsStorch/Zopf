import { getBrand } from '@/lib/brand';

/** Web app manifest of one route link, so the route can live on the home screen and open without reception. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response('Not found', { status: 404 });
  const brand = getBrand();
  const manifest = {
    name: `${brand.appName} · Route`,
    short_name: brand.appName,
    start_url: `/route/${token}`,
    scope: `/route/${token}`,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: brand.primary,
    icons: [{ src: '/brand/logo', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

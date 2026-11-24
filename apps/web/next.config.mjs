import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Web and API share one domain: on the server Traefik sends /api to the backend.
 * The rewrite below does the same locally (and is the fallback in the container).
 * INTERNAL_API_URL is the backend's address in the private Docker network.
 */
const internalApi = (process.env.INTERNAL_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js needs inline scripts for hydration; eval only for the dev server.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "font-src 'self' data:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  turbopack: { root: path.resolve(__dirname, '../../') },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${internalApi}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Geolocation stays available to the app itself (delivery view, later).
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]),
        ],
      },
    ];
  },
};

export default nextConfig;

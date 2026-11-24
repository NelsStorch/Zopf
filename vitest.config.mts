import { defineConfig } from 'vitest/config';

// Unit tests without a database. The Prisma client only connects on the first
// query, so the URL below is never opened.
export default defineConfig({
  test: {
    include: ['apps/backend/src/**/*.test.ts', 'packages/shared/src/**/*.test.ts'],
    environment: 'node',
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'test-secret-with-at-least-32-characters-ok',
      TZ: 'Europe/Zurich',
    },
  },
});

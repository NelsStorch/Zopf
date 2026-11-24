import 'dotenv/config';
import fs from 'fs';
import fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerAuth } from './lib/auth.js';
import { bootstrap } from './lib/bootstrap.js';
import { prisma } from './lib/prisma.js';
import { adminAddressRoutes } from './routes/admin-addresses.js';
import { adminCampaignRoutes } from './routes/admin-campaigns.js';
import { adminOrderRoutes } from './routes/admin-orders.js';
import { publicOrderRoutes } from './routes/public-orders.js';
import { scheduleOutbox } from './lib/mail.js';
import { scheduleOrderCleanup } from './lib/orders.js';
import { scheduleRetention } from './lib/retention.js';
import { authRoutes } from './routes/auth.js';
import { publicRoutes } from './routes/public.js';

const VERSION: string = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version;

const app = fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    // No IP addresses, headers, cookies or query strings in the log: links carry secrets.
    serializers: {
      req: (req) => ({ method: req.method, route: req.routeOptions?.url ?? 'unknown' }),
    },
  },
  // Behind Traefik in a private network: request.ip is the visitor, not the proxy.
  trustProxy: ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7'],
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);
app.setErrorHandler((error, request, reply) => {
  if (hasZodFastifySchemaValidationErrors(error)) {
    return reply.status(400).send({ error: 'invalid_input', details: error.validation });
  }
  request.log.error({ err: error }, 'request failed');
  const { statusCode, message } = error as { statusCode?: number; message?: string };
  const status = statusCode ?? 500;
  reply.status(status).send({ error: status >= 500 ? 'server_error' : message });
});

async function start() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be set and contain at least 32 characters.');
  }

  // The API answers with JSON and PDFs only; the web app sets its own CSP.
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(jwt, { secret: jwtSecret });
  registerAuth(app);

  app.get('/api/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', version: VERSION };
  });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(publicRoutes, { prefix: '/api/v1/public' });
  await app.register(publicOrderRoutes, { prefix: '/api/v1/public' });
  // Everything under /api/v1/admin needs an admin session (hook in each plugin).
  await app.register(adminCampaignRoutes, { prefix: '/api/v1/admin' });
  await app.register(adminAddressRoutes, { prefix: '/api/v1/admin' });
  await app.register(adminOrderRoutes, { prefix: '/api/v1/admin' });

  await bootstrap(app.log);
  scheduleOutbox(app.log);
  scheduleOrderCleanup(app.log);
  scheduleRetention(app.log);

  const port = Number(process.env.PORT) || 4000;
  await app.listen({ port, host: '0.0.0.0' });
}

// docker stop / deploy: finish running requests, close the database, end within 10 s.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    const timer = setTimeout(() => process.exit(1), 10_000);
    timer.unref();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});

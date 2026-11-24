FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*

# 1. Dependencies (hoisted to /app/node_modules by npm workspaces)
FROM base AS dependencies
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/
RUN npm ci --workspace=apps/backend --workspace=packages/shared --include-workspace-root

# 2. Development target (docker-compose.dev.yml mounts the sources)
FROM base AS development
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
RUN cd packages/shared && npm run build
WORKDIR /app/apps/backend
RUN npx prisma generate
EXPOSE 4000
CMD ["npm", "run", "dev"]

# 3. Build
FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
RUN cd packages/shared && npm run build
WORKDIR /app/apps/backend
RUN npm run build

# 4. Production runner
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts
COPY apps/backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY apps/backend/db-migrate.sh ./apps/backend/
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh ./apps/backend/db-migrate.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/apps/backend
EXPOSE 4000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["sh", "-c", "sh ./db-migrate.sh && node dist/server.js"]

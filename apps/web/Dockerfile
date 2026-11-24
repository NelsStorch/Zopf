FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# 1. Dependencies
FROM base AS dependencies
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN npm ci --workspace=apps/web --workspace=packages/shared --include-workspace-root

# 2. Development target (docker-compose.dev.yml mounts the sources)
FROM base AS development
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN cd packages/shared && npm run build
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "run", "dev"]

# 3. Build. Branding and domain are NOT baked in: they are read at run time.
FROM base AS builder
# Backend address in the private Docker network, for the /api rewrite (next.config.mjs).
ARG INTERNAL_API_URL
ENV INTERNAL_API_URL=${INTERNAL_API_URL:-http://localhost:4000}
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN cd packages/shared && npm run build
WORKDIR /app/apps/web
RUN npm run build

# 4. Production runner
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
RUN chown -R node:node apps/web/.next
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# syntax=docker/dockerfile:1
# UniTech PM AI Assistant — production image (track 5c).
# Multi-stage: deps -> builder -> (runner | migrator).
#   runner   = lean Next.js standalone server (the app).
#   migrator = full deps + generated client, runs `prisma migrate deploy` (+ seed on demand).
# Base is Debian bookworm-slim (OpenSSL 3.0) to match the Prisma engine target
# declared in prisma/schema.prisma (debian-openssl-3.0.x).

FROM node:24-bookworm-slim AS base
# openssl + ca-certificates are required by the Prisma query engine at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- deps: install all dependencies (incl. dev — needed to build & to run migrations/seed) ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: generate Prisma client + build Next.js ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# --- migrator: short-lived init container for schema migrations (and manual seeding) ---
# Reuses the builder image (full deps + generated client + prisma/ + seed script),
# so both `prisma migrate deploy` and `npm run db:seed` work.
FROM builder AS migrator
ENV NODE_ENV=production
CMD ["npx", "prisma", "migrate", "deploy"]

# --- runner: minimal standalone production server ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
# Bind to all interfaces so the container is reachable from other services / the host.
ENV HOSTNAME=0.0.0.0
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

# Standalone output + static assets + public dir.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Belt-and-suspenders: ensure the generated Prisma client + query engine are present
# (file tracing usually catches these, but Prisma's native engine is easy to miss).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Runtime-writable dirs (local attachment storage + Excel write-back backups).
RUN mkdir -p uploads sample-data/backups && chown -R nextjs:nodejs uploads sample-data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

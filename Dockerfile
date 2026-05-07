# syntax=docker/dockerfile:1.7

# ---- Base ----
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app

# ---- Install deps (incl. dev, needed for build) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile

# ---- Build AdonisJS to ./build ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node ace build

# ---- Final runtime ----
FROM base AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3333
ENV TZ=UTC

# AdonisJS produces a self-contained build/ folder with its own package.json
COPY --from=builder /app/build ./
COPY pnpm-lock.yaml ./
RUN pnpm install --prod --no-frozen-lockfile \
 && pnpm store prune

EXPOSE 3333

# Run pending migrations then start the HTTP server
CMD ["sh", "-c", "node ace migration:run --force && node bin/server.js"]

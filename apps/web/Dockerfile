# ─── Base ─────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ─── Development ──────────────────────────────────────────────
FROM base AS development
ENV NODE_ENV=development
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json ./apps/web/
RUN npm install --workspace=packages/types --workspace=apps/web --ignore-scripts
COPY packages/types ./packages/types
COPY apps/web ./apps/web
WORKDIR /app/packages/types
RUN npm run build
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ─── Builder ──────────────────────────────────────────────────
# No NODE_ENV=production here — npm omits devDependencies when it's set, but
# typescript (via packages/types) is a devDependency needed to build.
FROM base AS builder
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time,
# so they must arrive as build ARGs, not just container-runtime env vars.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json ./apps/web/
RUN npm ci --workspace=packages/types --workspace=apps/web --ignore-scripts
COPY packages/types ./packages/types
COPY apps/web ./apps/web
WORKDIR /app/packages/types
RUN npm run build
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Production ───────────────────────────────────────────────
FROM node:20-alpine AS production
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# In a monorepo, Next.js standalone output mirrors the path from the
# workspace root (the lockfile location), so server.js ends up nested
# at apps/web/server.js rather than at the standalone root.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]

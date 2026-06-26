# ─── Base ─────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache curl
WORKDIR /app
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json ./apps/api/

# ─── Development ──────────────────────────────────────────────
FROM base AS development
ENV NODE_ENV=development
# --ignore-scripts: this context has no .git, so the root package.json's
# "prepare": "husky install" lifecycle script would fail (and the workspace
# subset install doesn't even pull in husky itself, since it's a root devDependency).
RUN npm install --workspace=packages/types --workspace=apps/api --ignore-scripts
COPY packages/types ./packages/types
COPY apps/api ./apps/api
WORKDIR /app/packages/types
RUN npm run build
WORKDIR /app/apps/api
RUN npx prisma generate
EXPOSE 3001 9464
CMD ["npx", "nest", "start", "--watch"]

# ─── Builder ──────────────────────────────────────────────────
# No NODE_ENV=production here — npm omits devDependencies when it's set, but
# @nestjs/cli (and tsc, via packages/types) are devDependencies needed to build.
FROM base AS builder
RUN npm ci --workspace=packages/types --workspace=apps/api --ignore-scripts
COPY packages/types ./packages/types
COPY apps/api ./apps/api
WORKDIR /app/packages/types
RUN npm run build
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

# Strip devDependencies now that the build is done — node_modules is hoisted
# to the workspace root, so prune from there, not from apps/api.
WORKDIR /app
RUN npm prune --omit=dev --workspace=packages/types --workspace=apps/api

# ─── Production ───────────────────────────────────────────────
FROM node:20-alpine AS production
RUN apk add --no-cache curl dumb-init
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder /app/packages/types/dist ./packages/types/dist

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 \
  && mkdir -p /app/logs /app/storage \
  && chown -R nestjs:nodejs /app/logs /app/storage
USER nestjs

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
  CMD curl -f http://localhost:3001/api/v1/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/main"]

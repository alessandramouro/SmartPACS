# SmartPACS Edge Agent Dockerfile
# Includes dcmtk for DICOM SCP support
FROM node:20-alpine AS base
RUN apk add --no-cache dcmtk curl dumb-init
WORKDIR /app

FROM base AS development
ENV NODE_ENV=development
COPY package.json turbo.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/edge-agent/package.json ./apps/edge-agent/
RUN npm install --workspace=packages/types --workspace=apps/edge-agent
COPY packages/types ./packages/types
COPY apps/edge-agent ./apps/edge-agent
WORKDIR /app/packages/types
RUN npm run build
WORKDIR /app/apps/edge-agent
EXPOSE 3002 104/tcp
CMD ["npx", "nest", "start", "--watch"]

FROM base AS production
ENV NODE_ENV=production
COPY --from=development /app ./
WORKDIR /app/apps/edge-agent
RUN npm run build
RUN addgroup -g 1001 -S agent && adduser -S agent -u 1001
USER agent
EXPOSE 3002
CMD ["dumb-init", "node", "dist/main"]

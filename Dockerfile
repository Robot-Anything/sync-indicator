FROM node:20-alpine AS base

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.29.1 --activate

# --- shared dependencies ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/sync/package.json packages/sync/
COPY packages/api/package.json packages/api/
RUN pnpm install --frozen-lockfile

# --- build stage for sync ---
FROM deps AS sync-build
COPY . .
RUN pnpm --filter @sync-indicator/sync run build

# --- build stage for api ---
FROM deps AS api-build
COPY . .
RUN pnpm --filter @sync-indicator/api run build

# --- runtime for sync ---
FROM base AS sync
WORKDIR /app
COPY --from=sync-build /app/packages/sync/dist ./dist
COPY --from=sync-build /app/node_modules ./node_modules
CMD ["node", "dist/scripts/init-db.js"]

# --- runtime for api ---
FROM base AS api
WORKDIR /app
COPY --from=api-build /app/packages/api/dist ./dist
COPY --from=api-build /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/index.js"]

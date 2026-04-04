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
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

# --- build stage for sync ---
FROM deps AS sync-build
COPY . .
RUN pnpm --filter @sync-indicator/core run build
RUN pnpm --filter @sync-indicator/sync run build

# --- build stage for api ---
FROM deps AS api-build
COPY . .
RUN pnpm --filter @sync-indicator/core run build
RUN pnpm --filter @sync-indicator/api run build

# --- runtime for sync ---
FROM base AS sync
WORKDIR /app
COPY --from=sync-build /app/packages/sync/dist ./packages/sync/dist
COPY --from=sync-build /app/packages/core/dist ./packages/core/dist
COPY --from=sync-build /app/packages/core/package.json ./packages/core/
COPY --from=sync-build /app/packages/sync/package.json ./packages/sync/
COPY --from=sync-build /app/package.json ./package.json
COPY --from=sync-build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=sync-build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --prod --frozen-lockfile
CMD ["node", "packages/sync/dist/scripts/init-db.js"]

# --- runtime for api ---
FROM base AS api
WORKDIR /app
COPY --from=api-build /app/packages/api/dist ./packages/api/dist
COPY --from=api-build /app/packages/core/dist ./packages/core/dist
COPY --from=api-build /app/packages/core/package.json ./packages/core/
COPY --from=api-build /app/packages/api/package.json ./packages/api/
COPY --from=api-build /app/package.json ./package.json
COPY --from=api-build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=api-build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --prod --frozen-lockfile
EXPOSE 3001
CMD ["node", "packages/api/dist/index.js"]

# --- build stage for web ---
FROM deps AS web-build
COPY . .
RUN pnpm --filter @sync-indicator/web run build

# --- runtime for web (nginx) ---
FROM nginx:alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

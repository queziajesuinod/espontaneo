# Site do Espontâneo — build estático (Vite) servido pelo nginx.
# Contexto de build = raiz do monorepo.
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/site/package.json apps/site/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --filter=@espontaneo/site...

COPY packages/shared packages/shared
COPY apps/site apps/site
RUN pnpm --filter=@espontaneo/site build

# ---------- runtime ----------
FROM nginx:1.27-alpine
COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/site/dist /usr/share/nginx/html
EXPOSE 80

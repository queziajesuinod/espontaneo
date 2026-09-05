# API do Espontâneo — Fastify rodando TS direto (type stripping do Node 22).
# Contexto de build = raiz do monorepo (por causa do workspace pnpm).
FROM node:22-bookworm-slim AS deps
RUN corepack enable
WORKDIR /app

# manifestos primeiro, para cachear o install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/site/package.json apps/site/

# só as deps de produção da api (e do shared, que ela usa)
RUN pnpm install --frozen-lockfile --prod --filter=@espontaneo/api...

# ---------- runtime ----------
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY packages/shared packages/shared
COPY apps/api apps/api

WORKDIR /app/apps/api
EXPOSE 3335

# aplica as migrações (idempotente) e sobe o servidor
CMD ["sh", "-c", "node --experimental-strip-types scripts/migrar.ts && node --experimental-strip-types src/server.ts"]

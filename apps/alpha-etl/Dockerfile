FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /workspace

FROM base AS deps
RUN apk add --no-cache libc6-compat

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/alpha-etl/package.json apps/alpha-etl/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/knip-config/package.json packages/knip-config/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json

RUN HUSKY=0 pnpm install --frozen-lockfile --filter alpha-etl... --store-dir=/pnpm/store

FROM deps AS build
COPY packages/eslint-config packages/eslint-config
COPY packages/knip-config packages/knip-config
COPY packages/tsconfig packages/tsconfig
COPY packages/types packages/types
COPY apps/alpha-etl apps/alpha-etl

RUN pnpm --filter @zapengine/types build \
 && pnpm --filter alpha-etl build \
 && pnpm --filter alpha-etl deploy --legacy --prod --store-dir=/pnpm/store /out

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nodejs

COPY --from=build --chown=nodejs:nodejs /out/ ./

RUN mkdir -p logs \
 && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3003

ENV PORT=3003

CMD ["node", "dist/app.js"]

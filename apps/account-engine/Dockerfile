FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /workspace

FROM base AS deps
RUN apk add --no-cache libc6-compat

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/account-engine/package.json apps/account-engine/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json

RUN HUSKY=0 pnpm install --frozen-lockfile --filter account-engine... --store-dir=/pnpm/store

FROM deps AS build
COPY packages/eslint-config packages/eslint-config
COPY packages/tsconfig packages/tsconfig
COPY packages/types packages/types
COPY apps/account-engine apps/account-engine

RUN pnpm --filter @zapengine/types build \
 && pnpm --filter account-engine build \
 && pnpm --filter account-engine deploy --legacy --prod --store-dir=/pnpm/store /out \
 && test -f /out/dist/main.js

FROM node:22-alpine AS runner
WORKDIR /app

ARG COMMIT_SHA=""
ARG BUILD_TIME=""

ENV NODE_ENV=production \
    APP_COMMIT_SHA=$COMMIT_SHA \
    APP_BUILD_TIME=$BUILD_TIME

LABEL org.opencontainers.image.revision=$COMMIT_SHA \
      org.opencontainers.image.created=$BUILD_TIME

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nodejs

COPY --from=build --chown=nodejs:nodejs /out/ ./

RUN mkdir -p logs temp \
 && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3004

ENV PORT=3004

CMD ["node", "dist/main.js"]

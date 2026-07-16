FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /workspace

FROM base AS deps
RUN apk add --no-cache libc6-compat ffmpeg python3 make g++
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/podcast-pipeline/package.json apps/podcast-pipeline/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/knip-config/package.json packages/knip-config/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
RUN HUSKY=0 pnpm install --frozen-lockfile --filter @zapengine/podcast-pipeline... --store-dir=/pnpm/store

FROM deps AS build
COPY packages/design-tokens packages/design-tokens
COPY packages/eslint-config packages/eslint-config
COPY packages/knip-config packages/knip-config
COPY packages/tsconfig packages/tsconfig
COPY apps/podcast-pipeline apps/podcast-pipeline
RUN pnpm --filter @zapengine/design-tokens build \
 && pnpm --filter @zapengine/podcast-pipeline build \
 && pnpm --filter @zapengine/podcast-pipeline deploy --legacy /out \
 && cp -R apps/podcast-pipeline/assets /out/assets \
 && cp -R apps/podcast-pipeline/prompts /out/prompts \
 && test -f /out/dist/index.js

FROM node:24-alpine AS runner
RUN apk add --no-cache ffmpeg
WORKDIR /app

ARG COMMIT_SHA=""
ARG BUILD_TIME=""
ENV NODE_ENV=production \
    APP_COMMIT_SHA=$COMMIT_SHA \
    APP_BUILD_TIME=$BUILD_TIME \
    VIDEO_FFMPEG_PATH=/usr/bin/ffmpeg \
    PORT=3000

LABEL org.opencontainers.image.revision=$COMMIT_SHA \
      org.opencontainers.image.created=$BUILD_TIME

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nodejs

COPY --from=build --chown=nodejs:nodejs /out/ ./
USER nodejs
EXPOSE 3000
CMD ["node", "dist/index.js"]

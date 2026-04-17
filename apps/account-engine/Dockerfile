# Use Node.js 22 Alpine for smaller image size
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /usr/src/app

# Copy package files
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Build the application
FROM base AS builder
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Production image
FROM base AS runner
WORKDIR /usr/src/app

ENV NODE_ENV=production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy necessary files
COPY --from=deps --chown=nodejs:nodejs /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/templates ./templates

# Prepare writable directories for the app runtime
RUN mkdir -p logs temp && chown -R nodejs:nodejs /usr/src/app

USER nodejs

EXPOSE 3004

ENV PORT=3004

# Start the server
CMD ["node", "dist/main.js"]

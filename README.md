# zapEngine

Turborepo + pnpm monorepo for Zap Pilot — a DeFi portfolio analytics and automation platform.

## Architecture

```
zapEngine/
├── apps/
│   ├── account-engine      # Hono API — user accounts, wallets, Telegram (port 3004)
│   ├── alpha-etl           # Express ETL — DeFi APR data ingestion (port 3003)
│   ├── analytics-engine    # FastAPI — portfolio analytics & risk metrics (port 8001)
│   ├── frontend            # React 19 + Vite — dashboard SPA
│   └── landing-page        # Next.js 15 — marketing & docs site (port 3000)
└── packages/
    ├── intent-engine       # Shared TypeScript library — DeFi routing logic
    ├── types               # Shared TypeScript types & Zod schemas
    └── tsconfig            # Shared TypeScript config presets
```

| App | Language | Framework | Deploy |
|---|---|---|---|
| account-engine | TypeScript | Hono 4.10 | Fly.io |
| alpha-etl | TypeScript | Express 4.18 | Fly.io |
| analytics-engine | Python 3.11+ | FastAPI | Fly.io |
| frontend | TypeScript | React 19 + Vite 7 | GitHub Pages |
| landing-page | TypeScript | Next.js 15 | GitHub Pages |

## Prerequisites

- Node.js >= 22
- pnpm >= 10 (`npm i -g pnpm`)
- Python 3.11+ and [`uv`](https://docs.astral.sh/uv/) (for analytics-engine only)

## Setup

```bash
pnpm install
```

Each app requires a `.env` file. Copy the example from each app:

```bash
cp apps/account-engine/.env.example apps/account-engine/.env
cp apps/alpha-etl/.env.example apps/alpha-etl/.env
cp apps/analytics-engine/.env.example apps/analytics-engine/.env
cp apps/frontend/.env.example apps/frontend/.env
cp apps/landing-page/.env.example apps/landing-page/.env
```

For analytics-engine specifically:

```bash
cd apps/analytics-engine && make install
```

## Development

```bash
# Start frontend + account-engine + analytics-engine (typical daily dev)
pnpm dev

# Start landing page only
pnpm dev:landing

# Start everything
pnpm dev:all
```

analytics-engine runs via `make dev` from its own directory (uvicorn, not pnpm).

## Common Tasks

```bash
# Build all packages (required before type-check)
pnpm build

# Type check all apps
pnpm type-check

# Lint
pnpm lint

# Test all (JS/TS)
pnpm test

# Run the full CI-equivalent suite
pnpm test:ci

# Test analytics-engine (Python)
cd apps/analytics-engine && make test

# Format
pnpm format
```

## Testing

| App | Framework | Run |
|---|---|---|
| account-engine | Jest 30 | `pnpm test` (from app dir) |
| alpha-etl | Vitest 4 | `pnpm test` |
| analytics-engine | pytest 8 | `make test` (local) / `pnpm --filter analytics-engine test:ci` |
| frontend | Vitest 4 + Playwright | `pnpm test:unit` / `pnpm test:e2e` / `pnpm test:ci` |
| landing-page | Jest 29 | `pnpm test` |

## Deployment

- **Backend services** → Fly.io via GitHub Actions (push to `main`)
- **Frontend / Landing** → GitHub Pages via GitHub Actions
- CI triggers on push to `main` and PRs; deploys only on `main`

## Database

All backend services connect to a Supabase PostgreSQL database. analytics-engine uses a dedicated read-only connection. account-engine uses dual clients: anon (RLS-enforced) + service-role (admin operations).

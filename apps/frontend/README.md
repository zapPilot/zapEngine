# Frontend

Vite + React 19 PWA for Zap Pilot — DeFi portfolio management, intent-based execution, and
analytics.

## Stack

Vite 7, React 19, TypeScript, Tailwind CSS v4, wagmi + viem, React Query, Framer Motion, Vitest,
Playwright.

## Setup

```bash
nvm use            # Node 24 (matches root .nvmrc)
pnpm install
# env lives at the monorepo root — `cp .env.example .env` at repo root if you haven't
pnpm dev           # Vite prints the local URL; debug UI is off by default
pnpm dev:debug     # same app with React Query Devtools + log viewer on
```

## Architecture

- API calls live in `src/services/` as plain functions — no classes, no direct `fetch()` in
  components.
- Wallet access goes through `useWalletProvider()` — never call Thirdweb/wagmi hooks directly.
- Imports use barrel paths (`@/services`, `@/types`, `@/utils`), not deep file paths.

State is split across React Query (server state), React Context (wallet/user), and feature-local
hooks.

## Env vars

All client-exposed variables must be prefixed `VITE_`. Key ones:

- `VITE_ACCOUNT_API_URL` — account-engine base URL
- `VITE_ANALYTICS_ENGINE_URL` — analytics-engine base URL
- `VITE_ENABLE_RQ_DEVTOOLS` — set to `1` only when debugging React Query state
- `VITE_ENABLE_LOG_VIEWER` — set to `1` only when debugging in-app logs

See the monorepo root `.env.example` for the full list.

## Deep dives

See [docs/](./docs/):

- [LAYERING.md](./docs/LAYERING.md)
- [PORTFOLIO_DATA_FLOW.md](./docs/PORTFOLIO_DATA_FLOW.md)
- [SERVICES.md](./docs/SERVICES.md)

## Deploy

Static build (`pnpm build` → `dist/`) deployed to Vercel via the repo's deploy workflow.

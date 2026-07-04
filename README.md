# zapEngine

zapPilot is a **DeFi portfolio analytics and automation platform** that returns full control of investments to users. Users manage assets through their own EOA wallet — no need to trust third-party vault smart contracts. The platform also powers the **From Fed to Chain** podcast, providing free financial knowledge to the community.

This codebase powers the full stack: TypeScript/Python microservices, a universal Expo/React Native app (iOS/Android/Web), an Electron macOS desktop shell, and a Next.js marketing site.

**Security** — Web3 projects are frequent targets for exploits and hacking. Code review and robust security practices are essential to protecting users' assets.

---

## License

MIT License — see [LICENSE](./LICENSE) for details.

---

Turborepo + pnpm monorepo for Zap Pilot — a DeFi portfolio analytics and automation platform.

## Architecture

```
zapEngine/
├── apps/
│   ├── account-engine      # Hono API — user accounts, wallets, Telegram (port 3004)
│   ├── alpha-etl           # Express ETL — DeFi APR data ingestion (port 3003)
│   ├── analytics-engine    # FastAPI — portfolio analytics & risk metrics (port 8001)
│   ├── desktop-electron    # Electron — macOS shell around the mobile-v2 web export
│   ├── landing-page        # Next.js 15 — marketing & docs site (port 3000)
│   ├── mobile-v2           # Expo / React Native — universal Zap Pilot app (iOS/Android/Web)
│   └── podcast-pipeline    # Hono — article → episode pipeline (port 3000)
└── packages/
    ├── design-tokens       # Shared Zap Pilot brand tokens (TS / Tailwind / CSS vars)
    ├── eslint-config       # Shared ESLint flat-config presets
    ├── intent-engine       # Shared TypeScript library — DeFi routing logic
    ├── knip-config         # Shared knip dead-code-detection base config
    ├── tsconfig            # Shared TypeScript config presets
    └── types               # Shared TypeScript types & Zod schemas
```

| App              | Language     | Framework         | Deploy                 |
| ---------------- | ------------ | ----------------- | ---------------------- |
| account-engine   | TypeScript   | Hono 4.12         | Fly.io                 |
| alpha-etl        | TypeScript   | Express 4.18      | Fly.io                 |
| analytics-engine | Python 3.11+ | FastAPI           | Fly.io                 |
| desktop-electron | TypeScript   | Electron          | macOS DMG              |
| landing-page     | TypeScript   | Next.js 15        | Vercel                 |
| mobile-v2        | TypeScript   | Expo 57 / RN 0.86 | Vercel (web) / EAS     |
| podcast-pipeline | TypeScript   | Hono 4.12         | Fly.io                 |

## Prerequisites

- Node.js 24.x
- pnpm >= 10 (`npm i -g pnpm`)
- Python 3.11+ and [`uv`](https://docs.astral.sh/uv/) (for analytics-engine only)

## Setup

```bash
pnpm install
```

All apps read from a single `.env` at the repo root — copy the example and fill in values:

```bash
cp .env.example .env
```

For analytics-engine's Python venv (first-time only):

```bash
pnpm --filter @zapengine/analytics-engine run build   # wraps `uv sync --locked`
```

## Development

```bash
# Start the daily product stack: mobile-v2 web + account-engine + analytics-engine + shared package watchers
pnpm dev

# Start analytics-engine only
pnpm dev analytics

# Start just one side of the daily stack
pnpm dev web   # mobile-v2 web (expo start --web, port 8081)
pnpm dev app   # mobile-v2 native dev client
pnpm dev api

# Start landing page only (includes /pitch/)
pnpm dev landing

# Run the desktop shell (Electron; loads the mobile-v2 web export)
pnpm --filter @zapengine/desktop-electron dev

# Build the macOS DMG
pnpm --filter @zapengine/desktop-electron package

# Static web export of the universal app (Vercel output / Electron renderer)
pnpm --filter @zapengine/mobile-v2 build:web

# Start everything
pnpm dev all
```

All apps — including analytics-engine — run via `pnpm <script>`. Python scripts wrap `uv run` under the hood; the CLI is uniform. The default `pnpm dev` includes analytics-engine so backtesting and analytics pages work out of the box. Use `pnpm dev lite` only when you are not touching those pages.

For build, test, lint, and type-check commands see [CLAUDE.md](./CLAUDE.md#per-app-tooling).

## Turbo Remote Cache (optional)

CI pushes build artifacts to Vercel Remote Cache. After merging `main` (lockfile / `package.json` changes), the next commit triggers a full cold-cache rebuild (~20s on `format:check`). To pull CI's cache locally and eliminate this penalty:

```bash
pnpm dlx turbo login   # one-time browser auth
pnpm dlx turbo link    # bind this repo to the Vercel team
```

After linking, Turbo checks remote cache on local misses — `pnpm verify` stays fast even after dependency upgrades.

## Deployment

- **Backend services** → Fly.io via GitHub Actions (push to `main`)
- **Universal app (web) / Landing / Docs** → Vercel (mobile-v2 root: `apps/mobile-v2`)
- **Desktop** → local/manual macOS DMG build from `apps/desktop-electron`
- CI triggers on push to `main` and PRs; deploys only on `main`

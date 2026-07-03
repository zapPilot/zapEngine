# zapEngine

zapPilot is a **DeFi portfolio analytics and automation platform** that returns full control of investments to users. Users manage assets through their own EOA wallet — no need to trust third-party vault smart contracts. The platform also powers the **From Fed to Chain** podcast, providing free financial knowledge to the community.

This codebase powers the full stack: TypeScript/Python microservices, a React dashboard, a Tauri macOS desktop shell, a Next.js marketing site, and a Flutter podcast app.

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
│   ├── desktop             # Tauri v2 — phone-frame wallet + podcast app (macOS)
│   ├── frontend            # React 19 + Vite — dashboard SPA
│   ├── landing-page        # Next.js 15 — marketing & docs site (port 3000)
│   ├── mobile              # Flutter — From Fed to Chain podcast app
│   └── podcast-pipeline    # Hono — article → episode pipeline (port 3000)
└── packages/
    ├── design-tokens       # Shared Zap Pilot brand tokens for web + Flutter
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
| desktop          | TypeScript   | Tauri v2          | macOS DMG              |
| frontend         | TypeScript   | React 19 + Vite 7 | Vercel                 |
| landing-page     | TypeScript   | Next.js 15        | Vercel                 |
| mobile           | Dart         | Flutter           | App Store / Play Store |
| podcast-pipeline | TypeScript   | Hono 4.12         | Fly.io                 |

## Prerequisites

- Node.js 24.x
- pnpm >= 10 (`npm i -g pnpm`)
- Python 3.11+ and [`uv`](https://docs.astral.sh/uv/) (for analytics-engine only)
- Rust / Cargo and Xcode Command Line Tools (for desktop native builds only)
- Flutter 3.32+ (for mobile only)

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
# Start the daily product stack: frontend + account-engine + analytics-engine + shared package watchers
pnpm dev

# Start analytics-engine only
pnpm dev analytics

# Start the lighter stack only when you do not need backtesting or analytics pages
pnpm dev lite

# Start just one side of the daily stack
pnpm dev frontend
pnpm dev api

# Start landing page only (includes /pitch/)
pnpm dev landing

# Run the desktop shell
pnpm --filter @zapengine/desktop dev

# Build the macOS DMG
pnpm --filter @zapengine/desktop package

# Run the mobile app
pnpm --filter @zapengine/mobile dev

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
- **Frontend / Landing / Docs** → Vercel
- **Desktop** → local/manual macOS DMG build from `apps/desktop`
- CI triggers on push to `main` and PRs; deploys only on `main`

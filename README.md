# zapEngine

zapPilot is a **self-custodial investment autopilot** for DeFi portfolios. It brings rules-based allocation across S&P 500 exposure, BTC/ETH, and stablecoins while users keep control through their own EOA wallet — signed from your wallet, held by no one else. The platform also powers the **From Fed to Chain** podcast, providing free financial knowledge to the community.

This codebase powers the full stack: TypeScript/Python microservices, a universal Expo/React Native app (iOS/Android/Web), an Electron macOS desktop shell, and a Next.js marketing site.

**Security** — Web3 projects are frequent targets for exploits and hacking. Code review and robust security practices are essential to protecting users' assets.

---

## License

MIT License — see [LICENSE](./LICENSE.md) for details.

---

Turborepo + pnpm monorepo for Zap Pilot — a DeFi portfolio analytics and automation platform.

## Architecture

```
zapEngine/
├── apps/
│   ├── account-engine      # Hono API — user accounts, wallets, Telegram (port 3004)
│   ├── alpha-etl           # Express ETL — DeFi APR data ingestion (port 3003)
│   ├── analytics-engine    # FastAPI — portfolio analytics & risk metrics (port 8001)
│   ├── control-center      # Founder-local ops dashboard and cost ledger UI/API
│   ├── desktop    # Electron — macOS shell around the app web export
│   ├── landing-page        # Next.js 15 — marketing & docs site (port 3000)
│   ├── app           # Expo / React Native — universal Zap Pilot app (iOS/Android/Web)
│   └── podcast-pipeline    # Hono — article → episode pipeline (port 3000)
└── packages/
    ├── design-tokens       # Shared Zap Pilot brand tokens (TS / Tailwind / CSS vars)
    ├── eslint-config       # Shared ESLint flat-config presets
    ├── intent-engine       # Shared TypeScript library — DeFi routing logic
    ├── knip-config         # Shared knip dead-code-detection base config
    ├── tsconfig            # Shared TypeScript config presets
    └── types               # Shared TypeScript types & Zod schemas
```

| App              | Language     | Framework         |
| ---------------- | ------------ | ----------------- |
| account-engine   | TypeScript   | Hono 4.12         |
| alpha-etl        | TypeScript   | Express 4.18      |
| analytics-engine | Python 3.11+ | FastAPI           |
| control-center   | TypeScript   | Vite / Hono       |
| desktop          | TypeScript   | Electron          |
| landing-page     | TypeScript   | Next.js 15        |
| app              | TypeScript   | Expo 57 / RN 0.86 |
| podcast-pipeline | TypeScript   | Hono 4.12         |

## Prerequisites

- Node.js 24.x
- pnpm >= 10 (`npm i -g pnpm`)
- Python 3.11+ and [`uv`](https://docs.astral.sh/uv/) (for analytics-engine only)

## Setup

```bash
pnpm install
```

Environment keys and non-secret values are versioned in
`config/env.manifest.mjs` and `config/env/{dev,prod}.env`. Secrets come from
Infisical. Install and authenticate the Infisical CLI before running `pnpm dev`.
For an offline emergency, create a root `.env` and opt in with
`pnpm dev --local-env`; the file is never read by default.

Human-maintained client values use canonical, unprefixed names. The env
projector creates `VITE_*`, `EXPO_PUBLIC_*`, and `NEXT_PUBLIC_*` values before
each bundler starts; do not add those generated aliases to a source store.

```bash
pnpm env:status --offline        # manifest + committed-value safety
pnpm env:status                  # include Infisical and every destination
pnpm env:show --target web       # redacts sensitive values
```

Deployment stores are written by CI, not from a laptop. Merging a change under
`config/env/`, `config/env.manifest.mjs`, or `config/env.destinations.mjs` to
`main` runs the `Environment apply` workflow, which applies every destination
with `--apply --prune` and then audits the whole fleet. Because a key removed
from the manifest is removed from production, review the dry run before merging.

Deleting a key therefore takes two merges: remove the code that reads it and let
that deploy finish, then remove it from the manifest. A single merge prunes the
value while the previous release is still serving traffic.

Deploying a Fly app re-asserts that one destination from the same manifest
before `flyctl deploy` runs, apply-only and without `--prune`. The deploy is not
ordered against `Environment apply`, so this is what keeps a new release from
starting ahead of the values it needs, or behind a rail that failed silently.

Rotating a secret changes no tracked file, so dispatch the same rail by hand:

```bash
gh workflow run env-apply.yml -f target=podcast-pipeline   # or target=all
gh workflow run env-apply.yml -f target=all -f dry_run=true  # SET/UNSET only
```

Locally the command is dry-run by default and `--apply` is break-glass only:

```bash
pnpm env:sync --target account-engine   # list the keys, change nothing
pnpm env:sync --target expo
```

`Environment apply` and the daily `Environment drift` audit share the same
`INFISICAL_UNIVERSAL_AUTH_CLIENT_ID`,
`INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`,
`FLY_API_TOKEN`, `EXPO_TOKEN`, and `VERCEL_TOKEN` repository secrets. The
Infisical identity only ever reads; the three platform tokens need write scope
for apply. Missing credentials make the workflow fail as not checkable.

For analytics-engine's Python venv (first-time only):

```bash
pnpm --filter @zapengine/analytics-engine run build   # wraps `uv sync --locked`
```

## Development

```bash
# Start the daily product stack: app web + account-engine + analytics-engine + shared package watchers
pnpm dev

# Start analytics-engine only
pnpm dev analytics

# Start just one side of the daily stack
pnpm dev web   # app web (expo start --web, port 8081)
pnpm dev app   # app native dev client
pnpm dev api

# Start landing page only (includes /pitch/)
pnpm dev landing

# Run the desktop shell (Electron; loads the app web export)
pnpm --filter @zapengine/desktop dev

# Build the macOS DMG
pnpm --filter @zapengine/desktop package

# Static web export of the universal app (Vercel output / Electron renderer)
pnpm --filter @zapengine/app build:web

# Start everything
pnpm dev all

# Release every dev port (kills this repo's dev servers, leaves others alone)
pnpm dev stop
```

`pnpm dev` frees the ports its stack needs before starting. A dev server from
this repo whose terminal is gone gets reclaimed automatically; one that still
looks live is reported so you can decide, and a process from another project is
never killed.

All apps — including analytics-engine — run via `pnpm <script>`. Python scripts wrap `uv run` under the hood; the CLI is uniform. The default `pnpm dev` includes analytics-engine so backtesting and analytics pages work out of the box. Use `pnpm dev lite` only when you are not touching those pages.

For development and verification commands, see [CONTRIBUTING.md](./CONTRIBUTING.md). Repository-wide engineering principles live in [AGENTS.md](./AGENTS.md). For the deployed topology, data ownership, and infrastructure sources of truth, see [current architecture](./docs/architecture/current.md).

## Turbo Remote Cache (optional)

CI pushes build artifacts to Vercel Remote Cache. After merging `main` (lockfile / `package.json` changes), the next commit triggers a full cold-cache rebuild (~20s on `format:check`). To pull CI's cache locally and eliminate this penalty:

```bash
pnpm dlx turbo login   # one-time browser auth
pnpm dlx turbo link    # bind this repo to the Vercel team
```

After linking, Turbo checks remote cache on local misses — `pnpm verify` stays fast even after dependency upgrades.

## Deployment

- **Backend services** → Fly.io via GitHub Actions (push to `main`)
- **Universal app (web) / Landing / Docs** → Vercel (app root: `apps/app`)
- **Universal app (iOS / Android)** → EAS Build + Submit via GitHub Actions,
  triggered manually from the Actions tab
  ([runbook](./apps/app/docs/android-release.md#ci-release))
- **Desktop** → local/manual macOS DMG build from `apps/desktop`
- CI triggers on push to `main` and PRs; deploys only on `main`

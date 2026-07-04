# Onboarding

A per-role reading order so you don't have to piece the docs together yourself.
Everyone does the common track first, then follows their app track. The full doc
map is [docs/README.md](./README.md).

## Everyone first (~15 min)

1. [README.md](../README.md) — what zapEngine is, the app/package layout, `pnpm install`.
2. [CLAUDE.md](../CLAUDE.md) — build order (Turbo), code style, the **architecture
   planes**, and the **verification hierarchy**.
3. [CONTRIBUTING.md → Daily Workflow](../CONTRIBUTING.md#daily-workflow).
4. `cp .env.example .env` and fill in values.

## Universal app — `apps/app` (Expo / React Native, iOS/Android/Web)

1. [apps/app/CLAUDE.md](../apps/app/CLAUDE.md) + [README](../apps/app/README.md).
2. [packages/app-core/CLAUDE.md](../packages/app-core/CLAUDE.md) — the RN-safe vs
   web-only boundary table (business logic lives in app-core, not the app).
3. Run `pnpm dev web` (web, port 8081) or `pnpm dev app` (native dev client).
   Web E2E: `pnpm turbo run test:e2e --filter=@zapengine/app` (port 3100).

## Desktop — `apps/desktop` (Electron/macOS)

1. [apps/desktop/CLAUDE.md](../apps/desktop/CLAUDE.md) — architecture, packaging gates, and the Privy origin spike.
2. The renderer is the app web export — build it first:
   `pnpm --filter @zapengine/app build:web`.
3. Run `pnpm --filter @zapengine/desktop dev`. Package a DMG with
   `pnpm --filter @zapengine/desktop package`.

## TypeScript backend — `account-engine` / `alpha-etl` / `podcast-pipeline`

1. The app's `CLAUDE.md` + `README.md`.
2. [docs/app-layout.md](./app-layout.md).
3. The **architecture planes** in [CLAUDE.md](../CLAUDE.md) — especially how
   plan-orchestration, `packages/intent-engine`, and the identity plane differ.
4. account-engine: [plan-orchestration-evolution](../apps/account-engine/docs/plan-orchestration-evolution.md).
   alpha-etl: [docs/adr/](../apps/alpha-etl/docs/adr).
5. Run `pnpm dev api`.

## Python analytics — `apps/analytics-engine`

1. [apps/analytics-engine/CLAUDE.md](../apps/analytics-engine/CLAUDE.md) —
   read-only DB rule, strict mypy, `uv` (never `pip`).
2. First-time: `pnpm --filter @zapengine/analytics-engine run build` (`uv sync --locked`).
3. [coding_standards](../apps/analytics-engine/docs/coding_standards.md),
   [snapshot_architecture](../apps/analytics-engine/docs/snapshot_architecture.md).
4. Tests/coverage need `DATABASE_READ_ONLY_URL` — see
   [CLAUDE.md → Analytics strategy measurement](../CLAUDE.md#analytics-strategy-measurement).
5. Run `pnpm dev analytics`.

## When CI fails

Don't fix it step-by-step. Reproduce the whole gate locally and fix in a batch —
see the `monorepo-ci-debugging` skill (and its siblings) in
[.agents/skills/](../.agents/skills). Quick start: `pnpm verify` (= parallel, all
failures at once), then the separate `pnpm security audit` and
`pnpm coverage check`, which aren't part of the core gate.

See @README.md for project overview and @package.json for root scripts.

> **Start here:** new to the repo or hunting for a doc? Use
> [docs/onboarding.md](docs/onboarding.md) (per-role reading order) and
> [docs/README.md](docs/README.md) (full doc map).

# Build order

Internal `packages/*` are built on demand — `turbo run` tasks declare `dependsOn: ["^build"]`, so `pnpm type-check`, `pnpm test`, `pnpm build` from the root always see fresh package output.

For single-workspace runs, **use Turbo, not pnpm filter**:

- ✅ `pnpm turbo run type-check --filter=@zapengine/mobile-v2` — respects `^build` deps
- ❌ `pnpm --filter @zapengine/mobile-v2 type-check` — runs `tsc` directly, hits TS2307 if `packages/types/dist` is empty

Stale build fix: `pnpm --filter @zapengine/types build` (targeted, any package) or `pnpm build packages` (all packages, rarely needed — the `contracts check` pipeline calls it internally because `contracts export` is raw `tsx` and bypasses Turbo).

## Turbo task glossary

| Task                     | Cache | dependsOn | Notes                                                                                                                     |
| ------------------------ | :---: | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `build`                  |   ✓   | `^build`  | Internal deps build first. `inputs` excludes `**/*.md`. Env scope: `NEXT_PUBLIC_*`, `VITE_*`.                             |
| `dev`                    |   ✗   | `^build`  | Persistent. Rebuilds packages once then runs your app's dev server.                                                       |
| `lint`                   |   ✓   | `^build`  | Type-aware ESLint needs package dist (like `type-check`); standalone runs surface resolution errors if you skip `^build`. |
| `type-check`             |   ✓   | `^build`  | TypeScript needs package dist; will surface TS2307 if you skip `^build`.                                                  |
| `test` / `test:coverage` |   ✓   | `^build`  | `passThroughEnv` whitelists `DATABASE_READ_ONLY*`, `TEST_DATABASE_URL`, `DATABASE_INTEGRATION_URL` for analytics-engine.  |
| `test:ci`                |   ✗   | `^build`  | Always re-runs (no cache). Same env passthrough.                                                                          |
| `deadcode` / `dup:check` |   ✓   | none      | Pure file scans.                                                                                                          |
| `codegen*`               |   ✓   | none      | design-tokens generates CSS / Dart from `tokens.json`.                                                                    |

Cache heuristics: `.env*` files are listed in `inputs` for `build`/`type-check`/`test*`, so editing any of them invalidates those caches broadly. To flip a runtime value, prefer a `process.env` override at run time over editing `.env`.

# Per-app tooling

All apps — including analytics-engine (Python/FastAPI) — expose the same `pnpm <script>` surface (`dev`, `test`, `test:ci`, `lint`, `type-check`, `format`, `format:check`, `security:audit`, etc.). Under the hood, analytics-engine scripts wrap `uv run …`, but the CLI is uniform.

First-time Python setup: `pnpm --filter @zapengine/analytics-engine run build` (runs `uv sync --locked`).

## Desktop (Tauri/macOS)

The desktop app is a Tauri v2 shell around its **own** phone-frame Vite app (`apps/desktop/src`), built on `@zapengine/app-core` — it does not wrap any other app's UI.

All desktop guardrails — packaging/DMG gates, Corepack/CI env notes, Rust/Xcode prerequisites, when the package gate is mandatory — live in [apps/desktop/CLAUDE.md](apps/desktop/CLAUDE.md). Do not duplicate them here. For any desktop code/config change, finish with the desktop gate from the root:

```bash
pnpm turbo run type-check lint test --filter=@zapengine/desktop
```

## Mobile (Flutter) exclusion

The mobile app is Dart/Flutter and has an independent toolchain (Flutter 3.32+, Xcode for iOS). Most TypeScript/Python contributors don't install it locally, so the repo provides `:core` / `:no-mobile` variants:

- `pnpm verify ci` — full CI gate excluding `@zapengine/mobile`
- `pnpm build core` / `format check core` / `security audit core` — same `--filter=!@zapengine/mobile`

If you install Flutter, just use the regular non-`:core` commands. CI runs the full matrix in parallel; mobile failures only block mobile deploys.

# Code style

- Service/API logic: plain functions in `src/services/`, no classes
- Imports: ES modules only (`import/export`), not CommonJS
- Validation: Zod v4 (not v3 — import paths and APIs differ slightly)
- Path alias: `@/*` → `src/*` in mobile-v2 only
- ESLint: flat config (`eslint.config.mjs`), not legacy `.eslintrc`
- App `src/` layout (TS server apps): see [docs/app-layout.md](./docs/app-layout.md)

# Key ports

| App                 | Port |
| ------------------- | ---- |
| mobile-v2 (web dev) | 8081 |
| landing-page        | 3000 |
| account-engine      | 3004 |
| alpha-etl           | 3003 |
| analytics-engine    | 8001 |
| mobile-v2 (web E2E) | 3100 |

# Database rules

- analytics-engine: read-only DB connection — NEVER add write operations here
- account-engine: dual Supabase clients — use anon client by default, service-role only for admin flows

# Architecture planes

Four planes + one composing layer. Do not let them bleed:

| Plane / layer          | Role                                                 | Lives in                                        |
| ---------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| Strategy               | _what_ allocation; builds no transactions            | analytics-engine                                |
| Intent / routing       | normalized intent → `PreparedTransaction[]`; pure    | `packages/intent-engine`                        |
| **plan-orchestration** | _composes_: strategy → normalized intent → exec plan | account-engine module (see evolution doc below) |
| Execution              | confirm, sign & broadcast                            | app clients (mobile-v2 / desktop) + wallet      |
| Identity / persistence | _who_, and remembering; plans no money movement      | account-engine                                  |

Dependency rule (one line): _the intent core is a pure package; only plan-orchestration composes strategy + intent downward; nothing depends upward; the identity plane owns no money-movement planning._

- `packages/intent-engine`: internal deps limited to `@zapengine/types`; zero analytics and zero identity knowledge; `intent → PreparedTransaction[]`.
- plan-orchestration owns the analytics→intent normalization (allocation % → chain/token intent) and the `POST /plan-orchestration/{deposit,rebalance}` contract (types in `@zapengine/types`). It is not an engine — never name it `intent-service` (collides with `intent-engine`).
- analytics-engine builds no transactions; app clients build no plans (confirm + execute); account-engine plans no money movement.
- One authoritative path per money-moving flow: never compute the same plan both client-side and server-side against a shared contract.

Where plan-orchestration lives today vs. when to extract `apps/plan-orchestration`: see [apps/account-engine/docs/plan-orchestration-evolution.md](apps/account-engine/docs/plan-orchestration-evolution.md) — that doc is the single source of truth for the migration state; do not restate it here.

# Pre-commit & local verification

Pre-commit runs only **fast** checks: `pnpm install` (frozen lockfile), `lint repo` drift checks, and `lint-staged` ESLint/Prettier on staged files. The full CI gate is **opt-in** locally; CI is authoritative.

## Verification hierarchy

| Command                | Scope                             | When to run                  |
| ---------------------- | --------------------------------- | ---------------------------- |
| `pnpm verify changed`  | committed + staged + working tree | AI fix inner loop            |
| `pnpm verify branch`   | origin/main...HEAD                | Before push / PR             |
| `pnpm verify parallel` | Full, parallel                    | Local fast gate before push  |
| `pnpm verify ci`       | CI canonical gate                 | CI / final gate before merge |

**Shallow clone note:** All `pnpm verify` subcommands fail on a shallow clone. Run `git fetch --unshallow origin` first.

### AI fix loop

1. Make your changes
2. Run `pnpm verify changed` — fast, affected packages only
3. If it fails, read `.ai-verify/result.json` — it names the failing job and points to its log under `.ai-verify/logs/`
4. Fix only errors related to the current change
5. Re-run until it passes
6. Before push: `pnpm verify branch`. Before PR merge: `pnpm verify parallel` or `pnpm verify ci`

Do NOT run `verify ci` during the fix loop — it is too slow.

### What the local gate covers

`pnpm verify ci` / `pnpm verify parallel` cover only the **core** CI jobs (format, repo drift, contracts parity, per-workspace type-check/lint/test/deadcode/duplication, analytics checks). They do **NOT** cover coverage, mobile, Docker, security audit, or deploy — those are separate GitHub jobs. The authoritative CI-job ↔ local-parity map lives in the `monorepo-ci-debugging` skill; when debugging CI, start there instead of restating job details here.

To run one core job directly: `pnpm lint repo`, `pnpm contracts check`, `pnpm turbo run type-check --filter=!@zapengine/mobile`, or the analytics gates `pnpm turbo run sql:audit service-reachability pylint:duplicate-check --filter=@zapengine/analytics-engine`.

# Python environment (analytics-engine)

Requires Python 3.11+ and `uv`. Do not use `pip` — use `uv add` for new dependencies. Type checking is strict (mypy); all functions need type annotations.

# Analytics strategy measurement

`pnpm test` / `test:ci` runs an in-process analytics-engine snapshot gate that needs `DATABASE_READ_ONLY_URL` pointed at the Supabase read-only replica — a local pg container will not satisfy it. DB-URL split + CI-secret requirement: see [apps/analytics-engine/CLAUDE.md](apps/analytics-engine/CLAUDE.md). Fixture refresh procedure: see [apps/analytics-engine/src/services/backtesting/CLAUDE.md](apps/analytics-engine/src/services/backtesting/CLAUDE.md).

Do not create git worktrees unless explicitly requested by the user. Work directly in the current checkout by default.

DO NOT send optional commentary

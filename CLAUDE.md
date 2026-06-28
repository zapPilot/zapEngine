See @README.md for project overview and @package.json for root scripts.

> **Start here:** new to the repo or hunting for a doc? Use
> [docs/onboarding.md](docs/onboarding.md) (per-role reading order) and
> [docs/README.md](docs/README.md) (full doc map). Most-jumped-to sections below:
> [Architecture planes](#architecture-planes) · [Verification hierarchy](#verification-hierarchy) · [Code style](#code-style) · [Per-app tooling](#per-app-tooling).

# Build order

Internal `packages/*` are built on demand — `turbo run` tasks declare `dependsOn: ["^build"]`, so `pnpm type-check`, `pnpm test`, `pnpm build` from the root always see fresh package output.

For single-workspace runs, **use Turbo, not pnpm filter**:

- ✅ `pnpm turbo run type-check --filter=@zapengine/frontend` — respects `^build` deps
- ❌ `pnpm --filter @zapengine/frontend type-check` — runs `tsc` directly, hits TS2307 if `packages/types/dist` is empty

If you hit a stale build anyway, `pnpm --filter @zapengine/types build` (or any specific package) is the targeted fix; `pnpm build packages` rebuilds all packages but is rarely needed — the `contracts check` pipeline calls it internally because `contracts export` is raw `tsx` and bypasses Turbo.

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

Cache miss heuristics: changing any `.env*` file invalidates `build`/`type-check`/`test*` caches because they're listed in `inputs`. If you only intend to flip a runtime value, prefer `process.env` overrides at run time rather than editing `.env`.

# Per-app tooling

All apps — including analytics-engine (Python/FastAPI) — expose the same `pnpm <script>` surface (`dev`, `test`, `test:ci`, `lint`, `type-check`, `format`, `format:check`, `security:audit`, etc.). Under the hood, analytics-engine scripts wrap `uv run …`, but the CLI is uniform.

First-time Python setup: `pnpm --filter @zapengine/analytics-engine run build` (runs `uv sync --locked`). Frontend uses `pnpm test:unit` (not `pnpm test`) for unit tests.

## Desktop (Tauri/macOS)

The desktop app is a native Tauri wrapper around `@zapengine/frontend`. Keep desktop-specific setup in [apps/desktop/README.md](apps/desktop/README.md) and AI guardrails in [apps/desktop/CLAUDE.md](apps/desktop/CLAUDE.md).

- Use the workspace `@tauri-apps/cli` binary; do not require a global `tauri` install.
- Native package/build validation requires Rust/Cargo and Xcode Command Line Tools.
- For desktop code/config changes, finish with the desktop gate from the root:
  `pnpm turbo run type-check lint test --filter=@zapengine/desktop`.
- `pnpm --filter @zapengine/desktop package` builds the DMG and can be slow; it is mandatory before handing off when the user asks about desktop packaging/build failures, or when changes touch `apps/desktop/src`, `apps/desktop/src-tauri`, desktop package scripts, Tauri config, or runtime imports that can affect the packaged app. In non-interactive hooks or agents, make sure a Corepack `pnpm` shim is first on `PATH` and run the same gate with `CI=true` so Corepack uses the root `packageManager`, Turbo child tasks inherit the same pnpm, and DMG creation skips Finder scripting.
- If the package command fails, keep debugging and fix code/config failures before final. Only hand off when blocked by an external prerequisite (for example missing dependencies after install, pnpm version/cache problems, Rust/Cargo, or Xcode Command Line Tools), and report the exact command and blocker instead of treating the gate as passed.
- The core verification gates include desktop's TypeScript/config checks, but not a full DMG release/signing flow unless the desktop package gate above applies.

## Mobile (Flutter) exclusion

The mobile app is Dart/Flutter and has an independent toolchain (Flutter 3.32+, Xcode for iOS). Most TypeScript/Python contributors don't install it locally, so the repo provides `:core` / `:no-mobile` variants:

- `pnpm verify ci` — full CI gate excluding `@zapengine/mobile`
- `pnpm build core` / `format check core` / `security audit core` — same `--filter=!@zapengine/mobile`

If you install Flutter, just use the regular non-`:core` commands. CI runs the full matrix in parallel; mobile failures only block mobile deploys.

# Code style

- Service/API logic: plain functions in `src/services/`, no classes
- Imports: ES modules only (`import/export`), not CommonJS
- Validation: Zod v4 (not v3 — import paths and APIs differ slightly)
- Path alias: `@/*` → `src/*` in frontend only
- ESLint: flat config (`eslint.config.mjs`), not legacy `.eslintrc`
- App `src/` layout (TS server apps): see [docs/app-layout.md](./docs/app-layout.md)

# Key ports

| App              | Port |
| ---------------- | ---- |
| frontend (dev)   | 3000 |
| landing-page     | 3000 |
| account-engine   | 3004 |
| alpha-etl        | 3003 |
| analytics-engine | 8001 |
| frontend (E2E)   | 3099 |

# Database rules

- analytics-engine: read-only DB connection — NEVER add write operations here
- account-engine: dual Supabase clients — use anon client by default, service-role only for admin flows

# Architecture planes

Four planes + one composing layer. Do not let them bleed:

| Plane / layer          | Role                                                 | Lives in                                                         |
| ---------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Strategy               | _what_ allocation; builds no transactions            | analytics-engine                                                 |
| Intent / routing       | normalized intent → `PreparedTransaction[]`; pure    | `packages/intent-engine`                                         |
| **plan-orchestration** | _composes_: strategy → normalized intent → exec plan | (now) account-engine module → (target) `apps/plan-orchestration` |
| Execution              | confirm, sign & broadcast                            | frontend + wallet                                                |
| Identity / persistence | _who_, and remembering; plans no money movement      | account-engine                                                   |

Dependency rule (one line): _the intent core is a pure package; only
plan-orchestration composes strategy + intent downward; nothing depends upward; the
identity plane owns no money-movement planning._

- `packages/intent-engine`: internal deps limited to `@zapengine/types`; zero analytics
  and zero identity knowledge; `intent → PreparedTransaction[]`.
- plan-orchestration owns the analytics→intent normalization (allocation % → chain/token
  intent — the hard part) and the `POST /plan-orchestration/{deposit,rebalance}`
  contract (types in `@zapengine/types`). It is not an engine — never name it
  `intent-service` (collides with `intent-engine`).
- analytics-engine builds no transactions; frontend builds no plans (confirm + execute);
  account-engine plans no money movement.
- One authoritative path per money-moving flow: never compute the same plan both
  client-side and server-side against a shared contract.

Evolution guardrail (multi-step roadmap for when deposit-plan stops being a
proxy, where the bounded module lives, and when to extract
`apps/plan-orchestration`): see
[apps/account-engine/docs/plan-orchestration-evolution.md](apps/account-engine/docs/plan-orchestration-evolution.md).

# Pre-commit & local verification

Pre-commit runs only **fast** checks: `pnpm install` (frozen lockfile, near-instant when unchanged), `lint repo` drift checks, and `lint-staged` ESLint/Prettier on staged files.

The full CI gate is **opt-in** locally — run `pnpm verify` before pushing if you want pre-push assurance. CI itself is still authoritative.

## Verification hierarchy

| Command                | Scope                             | When to run                  |
| ---------------------- | --------------------------------- | ---------------------------- |
| `pnpm verify changed`  | committed + staged + working tree | AI fix inner loop            |
| `pnpm verify branch`   | origin/main...HEAD                | Before push / PR             |
| `pnpm verify parallel` | Full, parallel                    | Local fast gate before push  |
| `pnpm verify ci`       | CI canonical gate                 | CI / final gate before merge |

**Shallow clone note:** All `pnpm verify` subcommands fail if the repo is a shallow clone. Run `git fetch --unshallow origin` first.

### AI fix loop

1. Make your changes
2. Run `pnpm verify changed` — fast, affected packages only
3. If it fails, read `.ai-verify/result.json` — it names the failing job and
   points to its log; read that log. `verify changed` writes one aggregate entry
   whose log is `.ai-verify/logs/verify-changed.log` (turbo `--summarize` drops
   `.turbo/runs/*.json` to localize the failing package#task)
4. Fix only errors related to the current change
5. Re-run until it passes
6. Before push, run `pnpm verify branch`
7. Before PR merge, run `pnpm verify parallel` (per-job logs — all failures at once) or `pnpm verify ci`

Do NOT run `verify ci` during the fix loop — it is too slow.

### What the local gate covers

`pnpm verify ci` (sequential gate, `scripts/verify-ci.sh`) and
`pnpm verify parallel` (parallel runner, `scripts/verify-ci-parallel.sh`,
writes `.ai-verify/result.json` + `.ai-verify/logs/<job>.log`) cover the core
jobs in `scripts/ci-jobs.sh`: format check, repository drift checks, contracts
parity, per-task workspace checks (type-check, lint, test, deadcode,
duplication), and analytics checks. They do NOT cover coverage, mobile, Docker,
security audit (`pnpm security audit core`), or deploy — those are separate CI
jobs / GitHub Actions. To fix failures, drive your agent (e.g. OpenCode `/goal`)
— see the `monorepo-ci-debugging` skill.

### Running individual CI jobs

The canonical gate is `pnpm verify ci` (all core jobs, sequential) or `pnpm verify parallel` (same jobs in parallel — see all failures at once). To run one job, invoke its task directly: `pnpm lint repo`, `pnpm contracts check`, `pnpm turbo run type-check --filter=!@zapengine/mobile`, or the analytics gates `pnpm turbo run sql:audit service-reachability pylint:duplicate-check --filter=@zapengine/analytics-engine`.

# Python environment (analytics-engine)

Requires Python 3.11+ and `uv`. Do not use `pip` — use `uv add` for new dependencies. Type checking is strict (mypy); all functions need type annotations.

# Analytics strategy measurement

`pnpm test` / `test:ci` runs an in-process analytics-engine snapshot gate that needs `DATABASE_READ_ONLY_URL` pointed at the Supabase read-only replica — a local pg container will not satisfy it (no production `alpha_raw.*` series). DB-URL split + CI-secret requirement: see [apps/analytics-engine/CLAUDE.md](apps/analytics-engine/CLAUDE.md). Fixture refresh procedure: see [apps/analytics-engine/src/services/backtesting/CLAUDE.md](apps/analytics-engine/src/services/backtesting/CLAUDE.md).

Do not create git worktrees unless explicitly requested by the user. Work directly in the current checkout by default.

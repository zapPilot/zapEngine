---
name: monorepo-ci-debugging
description: >-
  Use when a CI job in a pnpm + turbo monorepo fails, especially when failures
  appear one after another, a long local gate is silent, result.json is missing,
  or it is unclear which local command reproduces the named job. Symptoms:
  repeated GitHub round-trips, test:ci appearing hung, later deadcode,
  duplication, coverage, analytics, or security jobs surfacing after an earlier
  fix, or a PR touching `.env.example` unexpectedly invalidating broad Turbo
  caches.
---

# Monorepo CI debugging (pnpm + turbo)

## Core principle

**Start with the failure CI named. Reproduce its smallest faithful unit, fix it,
then widen verification one level at a time.**

The round-trip loop is structural, not bad luck. CI contains both a fail-fast
sequential core gate and separate parallel jobs. Fixing the first red gate often
only reveals the next latent gate.

## What CI actually runs

The main PR workflow has several jobs:

| GitHub job | What it does | Local parity |
| --- | --- | --- |
| `lint-test` | install → build core → `pnpm run verify ci` → `pnpm run security audit core` | `pnpm build core && pnpm verify ci && pnpm security audit core` |
| `coverage` | self-test coverage scripts → workspace `test:coverage` summary | copy the exact command from `.github/workflows/ci.yml`; currently `pnpm turbo run test:coverage --filter='!@zapengine/mobile' --filter='!@zapengine/desktop' && pnpm exec tsx scripts/coverage-summary.ts` |
| `check-dead-env` | env var drift check | `pnpm lint dead-env` |
| `mobile` / `mobile-gates` | mobile-only gates when mobile paths changed | mobile-specific, only when `apps/mobile` changed |
| `verify-fly-docker` | Docker verify when deploy/Docker paths changed | app-specific Docker verify |

`pnpm verify ci` / `pnpm verify parallel` reproduce only the core `lint-test`
checks, not `coverage`, `check-dead-env`, mobile, or Docker. A green core gate is
not the same as a green PR.

## Fast fix loop

1. **Read the evidence already available.**
   - GitHub named a job: read that job's log and capture the first real error.
   - A local verify command finished: read `.ai-verify/result.json`, then the
     named log under `.ai-verify/logs/`.
   - A full parallel run was interrupted: `result.json` may not exist because it
     is written only at the end. Read the surviving per-job logs; do not restart
     the full gate just to recreate the summary.
2. **Reproduce the smallest faithful unit.** Examples:
   - one workspace task: `pnpm turbo run <task> --filter=@zapengine/<workspace>`
   - one frontend unit file: `cd apps/frontend && pnpm exec vitest run <file>`
   - one frontend coverage file: `cd apps/frontend && pnpm exec vitest run --coverage --coverage.processingConcurrency=1 <file>`
   - one Playwright spec: `cd apps/frontend && PLAYWRIGHT_PORT=3099 pnpm exec playwright test <spec>`
   - repository check: `pnpm lint repo`, `pnpm contracts check`, or `pnpm lint dead-env`
3. **Fix the root cause and rerun that same narrow command.** Do not widen while
   the original failure is still red.
4. **Run `pnpm verify changed`.** It covers affected lint, type-check, test,
   e2e, deadcode, and duplication tasks. On failure, read
   `.ai-verify/logs/verify-changed.log` and the newest `.turbo/runs/*.json`.
5. **Follow the cascade.** The fail-fast order inside core means a fixed test can
   reveal deadcode or dup next. That is an exposed latent failure, not proof the
   first fix was incomplete.
6. **Before pushing, run the separate jobs your change touched.** Coverage and
   dead-env are the common misses.

## GitHub-first loop when CI already ran

Use `gh` when no one gave you logs, when local env lacks secrets, or when you need
cross-job state:

```bash
gh pr checks
gh run list --branch "$(git branch --show-current)" --limit 5
gh run view <run-id> --json jobs --jq '.jobs[] | select(.conclusion=="failure") | .name'
gh run view <run-id> --log-failed
```

Fix the whole batch of red jobs, then push once. Do not push after each small fix
just to let CI reveal the next job.

## Cache invalidation traps

Changing root files can expose unrelated-looking workspaces because Turbo inputs
are broad.

- `.env.example` is a global dependency. Editing it can invalidate build/test
  caches across many workspaces.
- `.env*` is an input for `build`, `type-check`, `test`, and `test:coverage`.
- `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json`, `.jscpd.json`, and
  `turbo.json` similarly widen the blast radius.

If a PR only meant to touch desktop adds a root env var, expect coverage and
other workspace gates to rerun. Read the failed workspace; do not assume the
workspace you changed is the workspace that failed.

## Desktop POC cascade pattern

The 2026-06-29 desktop real-data POC showed this sequence:

1. Desktop code changed and `.env.example` gained `VITE_MORALIS_API_KEY`.
2. Core desktop gates exposed type/test/deadcode/dup issues.
3. Landing-page deadcode/dup surfaced from pre-existing track-record debt.
4. The separate coverage job failed on `@zapengine/landing-page#test:coverage`,
   not desktop, because the workflow excludes desktop coverage.
5. A final format commit was needed after adding tests.

Lesson: once the first gate is fixed, immediately enumerate both core and
separate jobs instead of assuming the original app is the only blast radius.

## Triage: classify the failure → where to go

| Failing job / symptom | Bucket | Action |
| --- | --- | --- |
| `type-check` TS error | type error | fix the type inline |
| TS2307 `cannot find module @scope/pkg` | stale dist / build order | rebuild via turbo → **monorepo-build-import-errors** |
| `deadcode` / knip unused exports/deps | deadcode | remove, expose only if a test/public entry truly needs it, or knip-ignore a build-only shim with a reason |
| `dup:check` / jscpd clone | duplication | merge the clone, or `jscpd:ignore` an intentional one → **monorepo-dup-check** |
| `lint` / `format` would change | format | run the workspace formatter; final test additions often need a formatting commit |
| `coverage` job / workspace absolute floor | coverage | **monorepo-coverage-gate**; start from the failed workspace line |
| `check-dead-env` | env drift | `pnpm lint dead-env`; update `.env.example` only for real env references |
| analytics-engine Python format/mypy/contracts | python | **analytics-engine-ci-debugging** |
| security audit | vulnerable dep | **monorepo-security-audit** |
| desktop/Tauri-specific checks | desktop | **desktop-ci-debugging** |

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "CI named one test, so fixing that test completes the goal." | The gate stops at the first failure. Rerun narrow, then widen. |
| "`verify ci` passed, so the PR is green." | `coverage`, `check-dead-env`, mobile, and Docker are separate jobs. |
| "I'll push and let CI tell me the next failure." | That is exactly the slow round-trip cascade. Read all red jobs and fix the batch. |
| "The next failure is unrelated." | It may be latent debt exposed by cache invalidation or a separate job. Still fix or explicitly scope it. |
| "The PR touched desktop, so coverage failure must be desktop." | Current CI excludes desktop coverage. Read `Failed: @zapengine/<workspace>#test:coverage`. |
| "Local `pnpm coverage check` is always CI parity." | Not necessarily. Copy the exact workflow command and filters first. |

## Verification before handoff

```bash
# Core job
pnpm build core
pnpm verify ci
pnpm security audit core

# Separate jobs touched by the change
pnpm lint dead-env
pnpm turbo run test:coverage --filter='!@zapengine/mobile' --filter='!@zapengine/desktop'
pnpm exec tsx scripts/coverage-summary.ts
```

Run only the relevant separate jobs when the change clearly cannot affect them,
but be conservative after root config/env/dependency changes. Node 24 on CI is
authoritative.

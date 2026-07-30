---
name: monorepo-ci-debugging
description: >-
  Use when a GitHub CI job in the pnpm + turbo monorepo fails and it is unclear
  which local command reproduces the named job. Covers core verify loops, CI log
  triage, cascaded failures, and job-to-command mapping. For env drift use
  env-drift-ci-debugging; for app Playwright e2e use app-playwright-ci-debugging.
---

# Monorepo CI debugging (pnpm + turbo)

## Core principle

**Start with the failure CI named. Reproduce its smallest faithful unit, fix it,
then widen verification one level at a time.**

CI splits the core registry into independently rerunnable jobs, and each grouped
job runs all of its checks before reporting failure. Local `pnpm verify ci`
remains sequential and fail-fast for failure-order diagnosis.

## What CI actually runs

This table maps CI jobs to local parity. If it drifts from
`.github/workflows/ci.yml`, the workflow wins and this table should be updated.

| GitHub job          | What it does                                                                         | Local parity                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `quick-gates`       | format, repository drift, and contract parity                                        | `bash scripts/verify-jobs.sh format repo contracts`                                                                    |
| `code-quality`      | type-check, lint, deadcode, and duplication                                          | `bash scripts/verify-jobs.sh type-check lint deadcode dup`                                                             |
| `tests`             | workspace tests and analytics checks, with the CI database env                       | `bash scripts/verify-jobs.sh test analytics`                                                                           |
| `e2e`               | app web smoke tests with the Playwright browser                                      | `bash scripts/verify-jobs.sh e2e` → **app-playwright-ci-debugging**                                                    |
| `security`          | Node and Python dependency audits                                                    | `pnpm run security audit` → **monorepo-security-audit**                                                                |
| `deploy-gates`      | validate deploy registry and resolve changed-app matrices                            | `bash scripts/check-dispatch-registry-drift.sh`; test `scripts/resolve-deploy-matrix.sh` with its documented env cases |
| `ios-release-smoke` | clean iOS prebuild + Pods + Release simulator cold launch                            | `pnpm turbo run test:ios:release-smoke --filter=@zapengine/app` (macOS)                                                |
| `verify-fly-docker` | Docker verify when deploy/Docker paths changed                                       | app-specific Docker verify                                                                                             |
| `deploy-fly`        | run any app-specific verify script, then deploy the selected Fly apps on non-PR runs | run the registry-selected verify script locally; deployment remains CI-only                                            |
| `check-dead-env`    | env var drift check                                                                  | `pnpm lint dead-env` → **env-drift-ci-debugging**                                                                      |
| `coverage`          | self-test coverage scripts + workspace `test:coverage` summary                       | `pnpm run coverage test && pnpm turbo run test:coverage && pnpm exec tsx scripts/coverage-summary.ts`                  |

`pnpm verify ci` / `pnpm verify parallel` reproduce the union of `quick-gates`,
`code-quality`, `tests`, and `e2e`. They do not include `security`, `coverage`,
`check-dead-env`, deploy gates, or Docker. A green core gate is not the same as
a green PR.

## Fast fix loop

1. **Read the evidence already available.**
   - GitHub named a job: read that job's log and capture the first real error.
   - A local verify command finished: read `.ai-verify/result.json`, then the
     named log under `.ai-verify/logs/`.
   - A full parallel run was interrupted: `result.json` may not exist because it
     is written only at the end. Read surviving per-job logs first.
2. **Reproduce the smallest faithful unit.** Examples:
   - one workspace task: `pnpm turbo run <task> --filter=@zapengine/<workspace>`
   - one app unit file: `cd apps/app && pnpm exec vitest run <file>`
   - one app coverage file: `cd apps/app && pnpm exec vitest run --coverage <file>`
   - one Playwright spec → **app-playwright-ci-debugging**
   - repository check: `pnpm lint repo`, `pnpm contracts check`, or `pnpm lint dead-env`
3. **Fix the root cause and rerun that same narrow command.** Do not widen while
   the original failure is still red.
4. **Run `pnpm verify changed`.** It covers affected lint, type-check, test, e2e,
   deadcode, and duplication tasks. On failure, read
   `.ai-verify/logs/verify-changed.log` and the newest `.turbo/runs/*.json`.
5. **Follow the cascade.** A fixed test can reveal deadcode, duplication,
   coverage, or env drift next.
6. **Before pushing, run the separate jobs your change touched.** Coverage and
   dead-env are the common misses.

## GitHub-first loop when CI already ran

Use `gh` when logs were not provided, local env lacks secrets, or cross-job state
matters:

```bash
gh pr checks
gh run list --branch "$(git branch --show-current)" --limit 5
gh run view <run-id> --json jobs --jq '.jobs[] | select(.conclusion=="failure") | .name'
gh run view <run-id> --log-failed
```

Fix the whole batch of red jobs, then push once. Do not push after every tiny fix
just to let CI reveal the next failure.

## Evidence & completion rules

- Evidence is the **latest completed run** on the target ref (or `gh pr checks`
  when a PR exists). If the newest run is queued or in progress, wait for it to
  finish — never triage an older run as if it were current.
- Enumerate **all** failing jobs before fixing any one of them. A job named in
  the prompt or user report is a starting hint, never the scope.
- On `main` (or any tree with no diff vs `origin/main`), `pnpm verify changed`
  and `pnpm verify branch` resolve to zero affected packages and pass while
  running nothing. They are never evidence for a red CI job — use the failing
  job's full-scope parity command from the table above.
- CI red but local `turbo run <task>` green → suspect stale cache replay. Rerun
  uncached: `pnpm --filter @zapengine/<pkg> run <task>` or `turbo run <task> --force`.
- A CI-fix task is done only when the previously-red jobs' parity commands are
  green locally **and** the new run / PR checks are green after push.

## Formatting trap

A connector-created test file still has to pass workspace Prettier. For a
repeated `@zapengine/<workspace>#format:check` failure, run:

```bash
pnpm turbo run format --filter=@zapengine/<workspace>
pnpm turbo run format:check --filter=@zapengine/<workspace>
```

If only the GitHub connector is available, make a formatting-only follow-up commit
after CI prints the Prettier diff. If the same file fails again, rewrite touched
expressions into smaller Prettier-friendly shapes before another push.

## Root-file blast radius

Root config changes can invalidate broad Turbo caches and surface failures outside
the package you edited. Treat these as blast-radius expanders:

- `.env.example` / `.env*` → **env-drift-ci-debugging**
- `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json`, `.jscpd.json`, `turbo.json`
- shared packages under `packages/*`

Read the failed workspace and task before assuming the originally touched app is
the source.

## Triage: classify the failure → where to go

| Failing job / symptom                         | Bucket                   | Action                                                                                            |
| --------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `type-check` TS error                         | type error               | fix the type inline                                                                               |
| TS2307 `cannot find module @scope/pkg`        | stale dist / build order | **monorepo-build-import-errors**                                                                  |
| `deadcode` / knip unused exports/deps         | deadcode                 | remove, expose only if public/test entry needs it, or knip-ignore a build-only shim with a reason |
| `dup:check` / jscpd clone                     | duplication              | **monorepo-dup-check**                                                                            |
| `lint` / `format` would change                | format                   | run the workspace formatter; final test additions often need a formatting commit                  |
| `coverage` job / workspace absolute floor     | coverage                 | **monorepo-coverage-gate**                                                                        |
| `check-dead-env` / `.env.example` drift       | env drift                | **env-drift-ci-debugging**                                                                        |
| `apps/app` Playwright e2e                     | app e2e                  | **app-playwright-ci-debugging**                                                                   |
| analytics-engine Python format/mypy/contracts | python                   | **analytics-engine-ci-debugging**                                                                 |
| security audit                                | vulnerable dep           | **monorepo-security-audit**                                                                       |
| desktop/Electron-specific checks              | desktop                  | **desktop-ci-debugging**                                                                          |

## Rationalizations — STOP

| Excuse                                                         | Reality                                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "CI named one test, so fixing that test completes the goal."   | Other grouped jobs may also be red. Rerun narrow, then widen.                                            |
| "`verify ci` passed, so the PR is green."                      | Security, coverage, `check-dead-env`, deploy gates, and Docker are separate jobs.                        |
| "I'll push and let CI tell me the next failure."               | Read all red jobs and fix the batch.                                                                     |
| "The next failure is unrelated."                               | It may be latent debt exposed by cache invalidation or a separate job. Still fix or explicitly scope it. |
| "The PR touched app X, so the coverage failure must be app X." | Read `Failed: @zapengine/<workspace>#test:coverage`.                                                     |

## Verification before handoff

```bash
pnpm run verify parallel
pnpm run security audit

# Separate jobs touched by the change
pnpm lint dead-env
pnpm run coverage test
pnpm turbo run test:coverage
pnpm exec tsx scripts/coverage-summary.ts
```

Run only relevant separate jobs when the change clearly cannot affect them, but be
conservative after root config/env/dependency changes. Node 24 on CI is
authoritative.

---
name: monorepo-ci-debugging
description: >-
  Use when a CI job in a pnpm + turbo monorepo fails, especially when failures
  appear one after another, a long local gate is silent, result.json is missing,
  or it is unclear which local command reproduces the named job. Symptoms:
  repeated GitHub round-trips, test:ci appearing hung, or a later deadcode,
  duplication, analytics, or security job surfacing after an earlier fix. Also
  when you must read the failing jobs straight from GitHub with gh instead of a
  local gate.
---

# Monorepo CI debugging (pnpm + turbo)

## Core principle

**Start with the failure CI named. Reproduce its smallest faithful unit, fix it,
then widen verification one level at a time.**

The round-trip loop is not bad luck — it's structural. The CI "check" step is a
**`set -e` sequential gate** ([scripts/verify-ci.sh](../../../scripts/verify-ci.sh),
wired to `pnpm verify ci`) that runs the core jobs in order
(`format repo contracts type-check lint test e2e deadcode dup analytics`) and
**stops at the first failure**. So each push only ever reveals the _next_
failure in line. Fixing one advances the gate to the next — expect a cascade.
**CI (Node 24) is authoritative**, but the local fix loop should be fast enough
to finish and expose that cascade instead of disappearing into one silent run.

## Fast fix loop — start here

1. **Read the evidence already available.**
   - GitHub named a job: read that job's CI log and capture the first real error.
   - A local verify command finished: read `.ai-verify/result.json`, then the
     named log under `.ai-verify/logs/`.
   - A full parallel run was interrupted: `result.json` may not exist because it
     is written only at the end. Read the surviving per-job logs; do not restart
     the full gate just to recreate the summary.
2. **Reproduce the smallest faithful unit.** Examples:
   - frontend unit file: `cd apps/frontend && pnpm exec vitest run <file>`
   - frontend coverage file: `cd apps/frontend && pnpm exec vitest run --coverage --coverage.processingConcurrency=1 <file>`
   - frontend e2e spec: `cd apps/frontend && PLAYWRIGHT_PORT=3099 pnpm exec playwright test <spec>`
   - one workspace task: `pnpm turbo run <task> --filter=@zapengine/<workspace>`
   - repository check: invoke the named task directly, such as
     `pnpm lint repo` or `pnpm contracts check`
3. **Fix the root cause and rerun that same narrow command.** Do not widen while
   the original failure is still red.
4. **Run `pnpm verify changed`.** It covers affected lint, type-check, test,
   test:e2e, deadcode, and duplication tasks. On failure, read
   `.ai-verify/logs/verify-changed.log` and the newest `.turbo/runs/*.json` to
   locate the failing package/task.
5. **Follow the cascade instead of stopping.** The sequential order is
   `... → test → e2e → deadcode → dup → analytics`. A fixed frontend `test` failure
   can reveal `e2e` or `deadcode` next; that is a new exposed failure, not proof the first
   fix was incomplete. Fix the newly named job and run `verify changed` again.
   **Continue until there is no new failing job.**
6. **Widen before handoff.** Run `pnpm verify branch` before push. Before merge,
   run the full parallel or canonical CI gate, plus any separate CI job touched
   by the change.

This loop is intentionally iterative: narrow reproduction gives fast feedback;
`verify changed` catches affected neighboring gates; branch/full verification
catches repository-wide fallout.

## Pull the failures yourself with `gh` (when no one handed you a log)

Use this when **(a)** you cannot reproduce locally — shallow clone you cannot
`git fetch --unshallow`, missing `DATABASE_READ_ONLY_URL`, or not Node 24 — or
**(b)** you want the authoritative aggregated remote state across every job.

```bash
# Every job's status at once (lint-test / coverage / check-dead-env / mobile / docker)
gh pr checks
# Find the latest run for this branch
gh run list --branch "$(git branch --show-current)" --limit 5
# Read only the failed steps' logs, across all jobs
gh run view <run-id> --log-failed
# …or just list the failed job names
gh run view <run-id> --json jobs --jq '.jobs[] | select(.conclusion=="failure") | .name'
```

**Fix-until-green loop:**

1. `gh pr checks` — read **all** red jobs.
2. Map each red job → its local command (the _GitHub jobs → local commands_
   table) and **fix the whole batch in one pass**. Do not fix one and push — that
   per-failure push is exactly the round-trip cascade.
3. Push **once**.
4. `gh pr checks --watch` until it settles.
5. Still red? Back to 1. Repeat until every check is green.

**Caveat — `gh` does not replace local enumeration.** The `lint-test` job is the
`set -e` sequential gate, so `gh` shows only its **first** core failure too. To
see _all_ core failures at once you still need local `pnpm verify parallel`. What
`gh` uniquely gives you is the **cross-job view** — `coverage`, `check-dead-env`,
`mobile`, Docker — that no local core gate contains.

## Full gate — final enumeration, not the entry point

`pnpm verify parallel` is useful when you genuinely need every core job at once,
but it is a **20–30 minute, mostly silent final pass**. The slow part is the
`e2e` job (frontend Playwright suite) and the `test` job (unit tests across
workspaces). Frontend coverage is NOT in this gate — it runs in the separate
`coverage` CI job. Output is redirected to `.ai-verify/logs/`, and jobs are
collected in list order, so the console can sit after an earlier `passed` line
while E2E continues.

- Watch progress with `tail -f .ai-verify/logs/e2e.log` (E2E is the long pole).
- Check `node -v` is Node 24 before diagnosing coverage-v8 `ENOENT` retry storms
  (in the separate `coverage` job, or when reproducing a coverage file directly).
- On macOS, `--timeout` is ineffective unless `timeout` or `gtimeout` is installed.
- The runner deletes `.ai-verify/result.json` at start and rewrites it only after
  all jobs are collected. Interrupting it leaves logs but no summary.
- If warmup reports issues and several jobs show TS2307/build failures, rerun
  `pnpm build core` before chasing each log independently.

```bash
# Full core-job enumeration after the inner loop is green
pnpm build core
pnpm verify parallel

# Separate GitHub step; not included in verify ci/parallel
pnpm security audit core
```

## GitHub jobs → local commands (orient once)

CI runs **several parallel jobs** ([.github/workflows/ci.yml](../../../.github/workflows/ci.yml)).
`pnpm verify ci`/`parallel` reproduces **only the `lint-test` job** — `coverage`,
`check-dead-env`, `mobile`, and Docker run as **separate jobs a green core gate
never sees**. Most repeated round-trips come from pushing with a green core gate
and letting CI surface `coverage`/`check-dead-env` one at a time. Map every job
to its local command and run the ones your change touches **before** pushing:

| GitHub job                | Local equivalent                                                                | In `verify ci`/`parallel`? |
| ------------------------- | ------------------------------------------------------------------------------- | -------------------------- |
| `lint-test`               | `pnpm build core` → `pnpm verify ci` → `pnpm security audit core` (its 3 steps) | core part yes; audit no    |
| `coverage`                | `pnpm coverage summary` (aggregate) / `pnpm coverage check` (regression gate)   | ❌ separate job             |
| `check-dead-env`          | `pnpm lint dead-env`                                                             | ❌ separate job             |
| `mobile` / `mobile-gates` | mobile-specific gates (only when `apps/mobile` changed)                          | ❌ separate job             |
| `verify-fly-docker`       | Docker verify (only when Dockerfiles / deploy changed)                          | ❌ separate job             |
| `deploy-*`                | `main`-only deploy; does not run on PRs                                          | ❌                          |

`coverage` and `check-dead-env` bite most: invisible to `verify ci`/`parallel`,
so a change touching tests/coverage or env references must run
`pnpm coverage check` / `pnpm lint dead-env` locally before push.

## Verify command cheat-sheet

| Command                    | Scope                      | When                            |
| -------------------------- | -------------------------- | ------------------------------- |
| `pnpm verify changed`      | affected packages          | fast inner loop while iterating |
| `pnpm verify branch`       | `origin/main...HEAD`       | before push                     |
| `pnpm verify parallel`     | all core jobs, parallel    | final enumeration before merge  |
| `pnpm verify ci`           | canonical gate, sequential | final CI-parity confirmation    |
| `pnpm security audit core` | npm + python audit         | the separate audit step         |

All verify variants write `.ai-verify/result.json`; `changed` and `branch`
record one aggregate job and add Turbo summaries, while `ci` records completed
jobs until the first failure and `parallel` writes its summary only at the end.

## Triage: classify the failure → where to go

| Failing job / symptom                                                                   | Bucket                   | Difficulty | Action                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------- | ------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type-check` TS error                                                                   | type error               | easy       | fix the type inline                                                                                                                                                                                                  |
| TS2307 `cannot find module @scope/pkg`                                                  | stale dist / build order | medium     | rebuild via turbo → **monorepo-build-import-errors**                                                                                                                                                                 |
| `deadcode` / knip "unused"                                                              | deadcode                 | easy       | remove, or knip-ignore a build-only shim / barrel re-export                                                                                                                                                          |
| `dup:check` / jscpd clone                                                               | duplication              | easy       | merge the clone, or `jscpd:ignore` an intentional one → **monorepo-dup-check** (also when a dated dup quarantine expired)                                                                                            |
| `lint` / `format` "would change"                                                        | format                   | easy       | run `eslint --fix` / `prettier --write` — but if it "keeps reverting" → **monorepo-lint-format-loop**                                                                                                                |
| "Unexpected token 'export'" / build crash                                               | build / import           | **hard**   | **monorepo-build-import-errors** (+ frontend-test-ci-debugging for Vitest)                                                                                                                                           |
| `coverage` job / `pnpm coverage check` regressed or below threshold                     | coverage                 | medium     | **monorepo-coverage-gate** — a SEPARATE job, not in `verify ci`                                                                                                                                                      |
| analytics-engine `format:check` clean-lint-but-fails / mypy strict / Python `dup:check` | python                   | medium     | **analytics-engine-ci-debugging** (ruff `check` ≠ `format`)                                                                                                                                                          |
| `contracts` parity (zod ↔ pydantic)                                                     | contracts                | medium     | re-run `pnpm contracts check`, fix the drifted side → **analytics-engine-ci-debugging**                                                                                                                              |
| security audit                                                                          | vulnerable dep           | medium     | **monorepo-security-audit** — `pnpm-workspace.yaml` `overrides:`/`catalog:` (npm) or a `pyproject` constraint (uv), then `pnpm install`/`uv lock` and re-run `pnpm security audit core`. Never bump `--audit-level`. |

## Rationalizations — STOP

| Excuse                                                                                      | Reality                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "CI named one test, so fixing that test completes the goal."                                | The gate stops at the first failure. Rerun the narrow test, then `verify changed`; a later `deadcode` or `dup` failure may already be waiting.                                                                                     |
| "I should start with the full parallel gate so I can see everything."                       | It is a slow, silent final enumerator and writes `result.json` only at the end. Start from the named job and widen after the fix.                                                                                                  |
| "`result.json` is missing, so there is no recorded failure to act on."                      | An interrupted parallel run leaves no summary. Read the CI failure or surviving per-job logs and continue with the narrow command.                                                                                                 |
| "The next failure is unrelated, so I can stop after the original one is green."             | That is the expected fail-fast cascade. Continue until `verify changed` exposes no new failing job, then widen to branch/full verification.                                                                                        |
| "I can't reproduce CI locally without the secrets / exact runner."                          | Almost everything runs locally. Only the analytics snapshot gate needs `DATABASE_READ_ONLY_URL` — that one gate is the single thing legitimately validated only in CI, so don't burn cycles repro-ing it; let it validate on push. |
| "I'll just bump `--audit-level` / add a knip-ignore / `@ts-expect-error` to make it green." | That's weakening the check, not fixing it. `scripts/lint/*` and `scripts/verify-*.sh` are protected — edits get reverted.                                                                                                          |
| "`verify ci` passed, so I'm done."                                                          | `verify ci` does **not** include `security audit core`. Run it.                                                                                                                                                                    |
| "I'll push and let CI tell me the next failure."                                            | That's the round-trip cascade. Before pushing, enumerate core failures with `pnpm verify parallel` **and** run the separate jobs you touched (`pnpm coverage check`, `pnpm lint dead-env`); or read every failing job at once with `gh run view <run-id> --log-failed`, fix the batch, push once.                  |

## Verification

After a clean inner loop, run the full local sweep — **not just the core gate**.
`verify ci` is only the `lint-test` job; add the separate jobs your change
touched so CI does not surface them one push at a time:

```bash
# Core (lint-test job)
pnpm build core && pnpm verify ci && pnpm security audit core
# Separate jobs (NOT in verify ci) — run the ones your change touched:
pnpm coverage check     # coverage job        (tests / coverage touched)
pnpm lint dead-env      # check-dead-env job  (env references touched)
```

Fix everything red here **before** pushing, then push **once** — don't push and
let CI hand you the next failure. Node 24 on CI is authoritative; if a hard-fail
still remains, the gate advances to the next — fix iteratively.

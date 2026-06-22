---
name: monorepo-ci-debugging
description: >-
  Use when a CI job in a pnpm + turbo monorepo fails, especially when failures
  appear one after another, a long local gate is silent, result.json is missing,
  or it is unclear which local command reproduces the named job. Symptoms:
  repeated GitHub round-trips, test:ci appearing hung, or a later deadcode,
  duplication, analytics, or security job surfacing after an earlier fix.
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

## One-time orientation: GitHub `lint-test` job → local commands

The job ([.github/workflows/ci.yml](../../../.github/workflows/ci.yml)) has three
steps:

| GitHub step                    | Local command                                                           |
| ------------------------------ | ----------------------------------------------------------------------- |
| Build core packages            | `pnpm build core`                                                       |
| Run check-variant tasks        | `pnpm verify ci` (sequential) or `pnpm verify parallel` (all core jobs) |
| Security audit (Node + Python) | `pnpm security audit core`                                              |

Coverage, mobile, Docker, deploy, and security audit are separate jobs/steps.
A green core gate is not evidence that those passed.

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

## Verification

After a clean local pass, the literal CI sequence is the final confirmation:

```bash
pnpm build core && pnpm verify ci && pnpm security audit core
```

Then push **once** and read the GitHub CI log (Node 24 is authoritative). If a
hard-fail remains, the gate advances to the next — fix iteratively.

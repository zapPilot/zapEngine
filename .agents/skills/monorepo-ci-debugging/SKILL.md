---
name: monorepo-ci-debugging
description: >-
  Use when a CI job in a pnpm + turbo monorepo fails and you're fixing it one
  step at a time — fix what CI named, push, wait ~10 min, a *different* step
  fails, repeat. Also when unsure which local command reproduces the full CI
  gate, or when a later step (security audit) fails only after you fixed an
  earlier one (type-check / lint / test). Symptoms: round-tripping to GitHub per
  failure, "CI told me exactly what's wrong so I'll just fix that and push".
---

# Monorepo CI debugging (pnpm + turbo)

## Core principle

**Don't fix CI step-by-step. Reproduce the WHOLE gate locally so every failure
surfaces in one pass, fix them in a batch, push once.**

The round-trip loop is not bad luck — it's structural. The CI "check" step is a
**`set -e` sequential gate** ([scripts/verify-ci.sh](../../../scripts/verify-ci.sh),
wired to `pnpm verify ci`) that runs the core jobs in order
(`format repo contracts type-check lint test deadcode dup analytics`) and
**stops at the first failure**. So each push only ever reveals the *next*
failure in line. Fixing one advances the gate to the next — expect a cascade.
**CI (Node 24) is authoritative**, but you reproduce it locally to see the whole
list at once.

## One-time orientation: GitHub `lint-test` job → local commands

The job ([.github/workflows/ci.yml](../../../.github/workflows/ci.yml)) is just
three steps:

| GitHub step | Local command |
| --- | --- |
| Build core packages | `pnpm build core` |
| Run check-variant tasks | `pnpm verify ci` (sequential, stops first) **or** `pnpm verify parallel` (parallel — shows ALL at once) |
| Security audit (Node + Python) | `pnpm security audit core` |

**The gap that bites you:** `security audit core` is **NOT** part of
`verify ci`. Coverage / mobile / Docker are also separate CI jobs, not in the
local gate. So a green `verify ci` does **not** mean the audit step will pass —
run it yourself.

## See every failure at once

```bash
# 0. one-time: verify:* scripts hard-exit on a shallow clone
git fetch --unshallow origin   # only if needed

# 1. clean build FIRST — turbo tasks have dependsOn ^build; skipping this
#    produces phantom TS2307 "cannot find module @scope/pkg"
pnpm build core

# 2. fan every core job out in parallel → all failures land at once
pnpm verify parallel      # writes .ai-verify/result.json + logs/<job>.log

# 3. the SEPARATE audit step (not in verify ci)
pnpm security audit core
```

Read the failing job's log at `.ai-verify/logs/<job>.log`, fix, re-run. Drive the
fixes with whatever agent you use (e.g. OpenCode `/goal`).

> ⚠️ **`verify parallel` is a 20–30 min job with NO console output — silence is NOT a
> hang.** Its `test` job runs `test:ci` for every non-mobile workspace; frontend's alone
> is `test:coverage` (~109 serial vitest+coverage batches, ~8–9 min) **&&** `test:e2e`
> (Playwright real-browser suite, ~10 min). All output is redirected to
> `.ai-verify/logs/`, and the runner `wait`s on jobs in listed order, so after
> `[lint] passed` the console sits quiet while the slow `test` job churns. That is
> expected. Watch real progress with `tail -f .ai-verify/logs/test.log`. **Run it as the
> final pre-push pass (ideally backgrounded) — never as the first move or inside the fix
> loop.**
>
> - **Requires Node 24** (`.nvmrc` / root `engines`). On a newer major the frontend
>   coverage runner (`scripts/run-sharded-coverage.js`, gated to Node 24) drives
>   coverage-v8, which throws intermittent `ENOENT`/`Unhandled Error` reading its temp
>   files → batch-retry storms that push `test:ci` from "slow" to "never finishes".
>   **Check `node -v` = 24 BEFORE blaming the gate.**
> - **macOS has no `timeout`/`gtimeout`** → `pnpm verify parallel --timeout N` is silently
>   ignored (the script warns and runs with no timeout). Don't rely on it to bound a slow job.
> - `verify parallel` deletes `.ai-verify/result.json` at start and rewrites it only at
>   the end — interrupt it and result.json is gone; the per-job `.ai-verify/logs/<job>.log`
>   files persist, so read those.

**When CI already named ONE failing job, don't lead with the full gate** — reproduce that
job's *fastest* variant in the inner loop, and save `verify parallel` for the final
enumeration:

- frontend unit only (no coverage, no e2e — ~3 min): `pnpm --filter @zapengine/frontend test:unit`
- one e2e spec: `cd apps/frontend && PLAYWRIGHT_PORT=3099 pnpm exec playwright test <spec>`
- one coverage file (matches the CI runner): `cd apps/frontend && pnpm exec vitest run --coverage <file>`

**Every `verify` variant writes the same `.ai-verify/result.json` + per-job
logs** — not just `parallel`. `verify ci` (sequential) records each job as it
runs; `verify changed` / `branch` record a single aggregate entry and
add turbo `--summarize` (`.turbo/runs/*.json`) you can drill into. So the
read-`result.json` → read-the-log loop is identical whichever one you ran.

**Two footguns of the batch approach:**

- **Re-run the full gate after fixing, before pushing.** A fix can break a
  previously-green job (removing a "dead" export breaks a type, a schema edit
  breaks a test). Run `pnpm verify parallel` a *second* time after the
  batch — don't push on the first green-by-fixing pass.
- If `verify parallel` prints "warmup had issues", multi-job `TS2307`/build
  crashes in the parallel logs are suspect — re-run `pnpm build core` and
  re-check before chasing phantom type errors across several logs.

## verify command cheat-sheet (the only ones worth knowing)

| Command | Scope | When |
| --- | --- | --- |
| `pnpm verify changed` | affected packages | fast inner loop while iterating |
| `pnpm verify branch` | `origin/main...HEAD` | before push |
| `pnpm verify parallel` | all core jobs, parallel | **see all failures at once** |
| `pnpm verify ci` | canonical gate, sequential | final confirmation / CI parity |
| `pnpm security audit core` | npm + python audit | the separate audit step |

Ignore any other `verify:*` / `check:*` you see referenced — they were aliases
and have been removed.

## Triage: classify the failure → where to go

| Failing job / symptom | Bucket | Difficulty | Action |
| --- | --- | --- | --- |
| `type-check` TS error | type error | easy | fix the type inline |
| TS2307 `cannot find module @scope/pkg` | stale dist / build order | medium | rebuild via turbo → **monorepo-build-import-errors** |
| `deadcode` / knip "unused" | deadcode | easy | remove, or knip-ignore a build-only shim / barrel re-export |
| `dup:check` / jscpd clone | duplication | easy | merge the clone, or `jscpd:ignore` an intentional one → **monorepo-dup-check** (also when a dated dup quarantine expired) |
| `lint` / `format` "would change" | format | easy | run `eslint --fix` / `prettier --write` — but if it "keeps reverting" → **monorepo-lint-format-loop** |
| "Unexpected token 'export'" / build crash | build / import | **hard** | **monorepo-build-import-errors** (+ frontend-test-ci-debugging for Vitest) |
| `coverage` job / `pnpm coverage check` regressed or below threshold | coverage | medium | **monorepo-coverage-gate** — a SEPARATE job, not in `verify ci` |
| analytics-engine `format:check` clean-lint-but-fails / mypy strict / Python `dup:check` | python | medium | **analytics-engine-ci-debugging** (ruff `check` ≠ `format`) |
| `contracts` parity (zod ↔ pydantic) | contracts | medium | re-run `pnpm contracts check`, fix the drifted side → **analytics-engine-ci-debugging** |
| security audit | vulnerable dep | medium | **monorepo-security-audit** — `pnpm-workspace.yaml` `overrides:`/`catalog:` (npm) or a `pyproject` constraint (uv), then `pnpm install`/`uv lock` and re-run `pnpm security audit core`. Never bump `--audit-level`. |

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "CI told me exactly what's wrong — fix that one thing and push." | The gate stops at the first failure; the next is already queued. Run the whole gate locally. |
| "Running the whole gate locally is slow." | One local pass < N×10-min GitHub round-trips. |
| "These are different categories (types, audit, lint), so they're independent — no single command covers them." | `verify parallel` runs them all; the audit is the one genuine extra command. |
| "I can't reproduce CI locally without the secrets / exact runner." | Almost everything runs locally. Only the analytics snapshot gate needs `DATABASE_READ_ONLY_URL` — that one gate is the single thing legitimately validated only in CI, so don't burn cycles repro-ing it; let it validate on push. |
| "I'll just bump `--audit-level` / add a knip-ignore / `@ts-expect-error` to make it green." | That's weakening the check, not fixing it. `scripts/lint/*` and `scripts/verify-*.sh` are protected — edits get reverted. |
| "`verify ci` passed, so I'm done." | `verify ci` does **not** include `security audit core`. Run it. |

## Verification

After a clean local pass, the literal CI sequence is the final confirmation:

```bash
pnpm build core && pnpm verify ci && pnpm security audit core
```

Then push **once** and read the GitHub CI log (Node 24 is authoritative). If a
hard-fail remains, the gate advances to the next — fix iteratively.

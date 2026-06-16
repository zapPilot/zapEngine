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
**`set -e` sequential gate** ([scripts/ci-autofix/gate.sh](../../../scripts/ci-autofix/gate.sh),
wired to `pnpm verify:ci`) that runs the core jobs in order
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
| Build core packages | `pnpm build:core` |
| Run check-variant tasks | `pnpm verify:ci` (sequential, stops first) **or** `pnpm verify:full:parallel` (parallel — shows ALL at once) |
| Security audit (Node + Python) | `pnpm security:audit:core` |

**The gap that bites you:** `security:audit:core` is **NOT** part of
`verify:ci` and **NOT** fixed by `ci-autofix` (its fixes need `pnpm-lock.yaml`
edits, a protected path). Coverage / mobile / Docker are also separate CI jobs,
not in the local gate. So a green `verify:ci` does **not** mean the audit step
will pass — run it yourself.

## See every failure at once

```bash
# 0. one-time: verify:* scripts hard-exit on a shallow clone
git fetch --unshallow origin   # only if needed

# 1. clean build FIRST — turbo tasks have dependsOn ^build; skipping this
#    produces phantom TS2307 "cannot find module @scope/pkg"
pnpm build:core

# 2. fan every core job out in parallel → all failures land at once
pnpm verify:full:parallel      # writes .ai-verify/result.json + logs/<job>.log

# 3. the SEPARATE audit step (not in verify:ci)
pnpm security:audit:core
```

Or `pnpm ci-autofix -- --model <provider/model>` to autonomously loop-fix the
core jobs (still NOT the audit). Read the failing job's log at
`.ai-verify/logs/<job>.log`.

**Two footguns of the batch approach:**

- **Re-run the full gate after fixing, before pushing.** A fix can break a
  previously-green job (removing a "dead" export breaks a type, a schema edit
  breaks a test). Run `pnpm verify:full:parallel` a *second* time after the
  batch — don't push on the first green-by-fixing pass.
- If `detect.sh` prints "warmup had issues", multi-job `TS2307`/build crashes in
  the parallel logs are suspect — re-run `pnpm build:core` and re-check before
  chasing phantom type errors across several logs.

## verify command cheat-sheet (the only ones worth knowing)

| Command | Scope | When |
| --- | --- | --- |
| `pnpm verify:changed` | affected packages | fast inner loop while iterating |
| `pnpm verify:branch` | `origin/main...HEAD` | before push |
| `pnpm verify:package -- --filter=@zapengine/X` | one workspace | package-specific check |
| `pnpm verify:full:parallel` | all core jobs, parallel | **see all failures at once** |
| `pnpm verify:ci` | canonical gate, sequential | final confirmation / CI parity |
| `pnpm security:audit:core` | npm + python audit | the separate audit step |

Ignore any other `verify:*` / `check:*` you see referenced — they were aliases
and have been removed.

## Triage: classify the failure → where to go

| Failing job / symptom | Bucket | Difficulty | Action |
| --- | --- | --- | --- |
| `type-check` TS error | type error | easy | fix the type inline |
| TS2307 `cannot find module @scope/pkg` | stale dist / build order | medium | rebuild via turbo → **monorepo-build-import-errors** |
| `deadcode` / knip "unused" | deadcode | easy | remove, or knip-ignore a build-only shim / barrel re-export |
| `dup:check` / jscpd clone | duplication | easy | merge, or `jscpd:ignore` an intentional shared signature |
| `lint` / `format` "would change" | format | easy | run `eslint --fix` / `prettier --write` — but if it "keeps reverting" → **monorepo-lint-format-loop** |
| "Unexpected token 'export'" / build crash | build / import | **hard** | **monorepo-build-import-errors** (+ frontend-test-ci-debugging for Vitest) |
| `contracts` parity (zod ↔ pydantic) | contracts | medium | re-run `pnpm contracts:check`, fix the schema |
| security audit | vulnerable dep | medium | add a `pnpm.overrides` entry in **root package.json** then `pnpm install` (this regenerates the lockfile — don't hand-edit it, don't bump `--audit-level`). Python side: constrain in `pyproject` / `uv lock`. Not fixed by `ci-autofix`. |

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "CI told me exactly what's wrong — fix that one thing and push." | The gate stops at the first failure; the next is already queued. Run the whole gate locally. |
| "Running the whole gate locally is slow." | One local pass < N×10-min GitHub round-trips. |
| "These are different categories (types, audit, lint), so they're independent — no single command covers them." | `verify:full:parallel` runs them all; the audit is the one genuine extra command. |
| "I can't reproduce CI locally without the secrets / exact runner." | Almost everything runs locally. Only the analytics snapshot gate needs `DATABASE_READ_ONLY_URL` — that one gate is the single thing legitimately validated only in CI, so don't burn cycles repro-ing it; let it validate on push. |
| "I'll just bump `--audit-level` / add a knip-ignore / `@ts-expect-error` to make it green." | That's weakening the check, not fixing it. `scripts/lint/*` and `scripts/verify-*.sh` are protected — edits get reverted. |
| "`verify:ci` passed, so I'm done." | `verify:ci` does **not** include `security:audit:core`. Run it. |

## Verification

After a clean local pass, the literal CI sequence is the final confirmation:

```bash
pnpm build:core && pnpm verify:ci && pnpm security:audit:core
```

Then push **once** and read the GitHub CI log (Node 24 is authoritative). If a
hard-fail remains, the gate advances to the next — fix iteratively.

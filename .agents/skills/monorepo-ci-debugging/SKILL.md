---
name: monorepo-ci-debugging
description: >-
  Use when a GitHub CI job in the pnpm + turbo monorepo fails and it is unclear
  which local command reproduces it. Covers CI-to-command mapping, evidence-first
  triage, cascaded failures, and widened verification.
---

# Monorepo CI debugging

## Core rule

Start with the failing CI job, reproduce its smallest faithful unit, fix it, then
widen verification. `.github/workflows/ci.yml` is authoritative when this file
drifts.

## CI job → local parity

| GitHub job | Local parity |
| --- | --- |
| `quick-gates` | `bash scripts/verify-jobs.sh format repo contracts` |
| `code-quality` | `bash scripts/verify-jobs.sh type-check lint deadcode dup` |
| `tests` | `bash scripts/verify-jobs.sh test analytics` |
| `e2e` | `bash scripts/verify-jobs.sh e2e` → **app-playwright-ci-debugging** |
| `security` | `pnpm run security audit` → **monorepo-security-audit** |
| `deploy-gates` | `bash scripts/check-dispatch-registry-drift.sh`; test `scripts/resolve-deploy-matrix.sh` with its documented env cases |
| `ios-release-smoke` | `pnpm turbo run test:ios:release-smoke --filter=@zapengine/app` (macOS) |
| `check-dead-env` | `pnpm lint dead-env` → **env-drift-ci-debugging** |
| `coverage` | `pnpm run coverage test && pnpm turbo run test:coverage && pnpm exec tsx scripts/coverage-summary.ts` |

`pnpm verify ci` / `pnpm verify parallel` cover only `quick-gates`,
`code-quality`, `tests`, and `e2e`. Security, coverage, dead-env, deploy/Docker,
and iOS smoke remain separate jobs.

## Fix loop

1. Read the named CI log first. For local verify failures, read
   `.ai-verify/result.json` and the referenced `.ai-verify/logs/*` file.
2. Enumerate every red job before editing; one named failure is a starting point,
   not the full scope.
3. Reproduce the smallest faithful unit, for example:
   - `pnpm turbo run <task> --filter=@zapengine/<workspace>`
   - `cd apps/app && pnpm exec vitest run <file>`
   - `pnpm lint repo`, `pnpm contracts check`, or `pnpm lint dead-env`
4. Fix the root cause and rerun that same command.
5. Run `pnpm verify changed`, then the separate jobs affected by the change.
6. Before handoff, confirm the previously-red PR checks are green on the latest
   head SHA.

When CI already ran, use GitHub evidence instead of pushing speculative fixes:

```bash
gh pr checks
gh run list --branch "$(git branch --show-current)" --limit 5
gh run view <run-id> --json jobs --jq '.jobs[] | select(.conclusion=="failure") | .name'
gh run view <run-id> --log-failed
```

## Project-specific traps

- **No-diff verify:** on `main` or a tree with no diff vs `origin/main`,
  `pnpm verify changed` / `pnpm verify branch` can pass while running zero
  affected packages. Use the failing job's full parity command instead.
- **Interrupted parallel verify:** `.ai-verify/result.json` is written only after
  the run finishes; inspect surviving per-job logs when the run is interrupted.
- **Stale cache suspicion:** if CI is red but `turbo run <task>` is green, rerun
  uncached with `pnpm --filter @zapengine/<pkg> run <task>` or
  `turbo run <task> --force`.
- **Root blast radius:** `.env*`, lock/workspace/root package files, `turbo.json`,
  `.jscpd.json`, and `packages/*` can surface failures outside the edited app.
  Read the failed workspace/task before assigning ownership.
- **Formatting loops:** follow **monorepo-lint-format-loop** rather than adding
  formatting workarounds here.
- **iOS cancellation/timeouts:** follow
  [IOS_RELEASE_SMOKE.md](./IOS_RELEASE_SMOKE.md) before changing app code.

## Route specialized failures

- TS2307 internal package resolution → **monorepo-build-import-errors**
- duplication / jscpd → **monorepo-dup-check**
- coverage → **monorepo-coverage-gate**
- env drift → **env-drift-ci-debugging**
- app Playwright → **app-playwright-ci-debugging**
- analytics Python checks → **analytics-engine-ci-debugging**
- security audit → **monorepo-security-audit**
- desktop-specific checks → **desktop-ci-debugging**

## Handoff

Run the full core gate when the change has broad/root impact:

```bash
pnpm run verify parallel
pnpm run security audit
```

Run other separate jobs only when touched, especially `pnpm lint dead-env` and
the coverage job above. Node 24 on CI is authoritative. A CI fix is complete only
when the original parity command is green locally and the latest PR checks are
green after push.

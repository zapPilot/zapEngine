---
name: monorepo-ci-debugging
description: 'Map a failing monorepo GitHub CI job to its local reproduction command when that mapping is unclear.'
---

# Monorepo CI debugging

## Core rule

Start with the failing CI job, reproduce its smallest faithful unit, fix it, then
widen verification. `.github/workflows/ci.yml` is authoritative when this file
drifts.

## CI job → local parity

| GitHub job          | Local parity                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `quick-gates`       | `bash scripts/verify-jobs.sh format repo contracts`                                                                                  |
| `code-quality`      | `bash scripts/verify-jobs.sh type-check lint deadcode dup`                                                                           |
| `tests`             | `bash scripts/verify-jobs.sh test analytics`                                                                                         |
| `e2e`               | `bash scripts/verify-jobs.sh e2e` → **app-playwright-ci-debugging**                                                                  |
| `security`          | `pnpm run security audit` → **monorepo-security-audit**                                                                              |
| `deploy-gates`      | `bash scripts/check-dispatch-registry-drift.sh`; `bash scripts/resolve-deploy-matrix.test.sh` (deploy_matrix / verify_matrix parity) |
| `ios-release-smoke` | `pnpm turbo run test:ios:release-smoke --filter=@zapengine/app` (macOS)                                                              |
| `check-dead-env`    | `pnpm lint dead-env` → **env-drift-ci-debugging**                                                                                    |
| `coverage`          | `pnpm run coverage test && pnpm run coverage summary`                                                                                |

`pnpm verify ci` / `pnpm verify parallel` cover only `quick-gates`,
`code-quality`, `tests`, and `e2e`. Security, coverage, dead-env, deploy/Docker,
and iOS smoke remain separate jobs.

## Fix loop

1. Read the named CI log first. For local verify failures, read
   `.ai-verify/result.json` and the referenced `.ai-verify/logs/*` file.
2. Inspect the current failed jobs to distinguish shared causes from unrelated
   failures. Fix jobs caused by this change or included in the user's requested
   scope; report other failures without expanding the assignment.
3. Reproduce the smallest faithful unit, for example:
   - `pnpm turbo run <task> --filter=@zapengine/<workspace>`
   - `cd apps/app && pnpm exec vitest run <file>`
   - `pnpm lint repo`, `pnpm contracts check`, or `pnpm lint dead-env`
4. Fix the root cause and rerun that same command. Follow root `AGENTS.md` for
   aggregate verification and handoff.

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
- **Knip workspace config:** this repo's shared Knip config is a code helper, not
  a JSON `extends` target. New TypeScript workspaces must use `knip.ts` with
  `defineKnipConfig` from `@zapengine/knip-config/base`; keep framework/MDX-only
  entries explicit and narrow instead of adding blanket deadcode ignores.
- **Fly deploy/verify matrix:** `deploy-gates` outputs `deploy_matrix` / `verify_matrix` (not `fly_*`). `pull_request` → `deploy=[]` + `verify=changed where verify_docker`; `push:refs/heads/main` → `deploy=ALL` (ignores `PATHS_CHANGES`) + `verify=[]`; `workflow_dispatch` → `deploy=requested` + `verify=[]`; non-main `push` → both `[]`. `paths-filter` still runs on `main` push for `app_ios` only. `scripts/resolve-deploy-matrix.test.sh` locks these 9 cases + full-object shape (`app/fly_config/secret_name/verify_package_script/verify_docker/capture_release_metadata`).
- **CI fleet converge:** top-level concurrency is `ci-${{ github.ref }}-${{ github.event_name }}` with `cancel-in-progress` on `push` or PR — latest `main` push cancels the previous `main` run so fleet converges to `main HEAD`. Per-app `deploy-fly` concurrency is only second-layer.
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

Use the root verification policy, then run the separate job parity commands
affected by the fix. Node 24 on CI is authoritative. Mark the local fix verified
when the original failure and one appropriate aggregate gate pass. Report pending
CI and unrelated failures separately; this does not mean the PR is ready to merge.

Before merge, require the current head's required checks to pass. If waiting is
part of the request, use one bounded observation window (10 minutes by default)
and report its result. Do not restart an unchanged window without new evidence or
a user request to keep monitoring. A request for all CI checks to pass broadens
the completion condition to those checks; report unresolved blockers honestly.

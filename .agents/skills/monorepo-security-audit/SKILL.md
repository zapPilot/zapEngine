---
name: monorepo-security-audit
description: >-
  Diagnoses ZapEngine dependency audit failures from `pnpm run security audit`,
  including pnpm GHSA/CVE findings and analytics-engine `pip-audit` PYSEC
  findings. Use when CI reports `security:audit`, an installed and fixed version,
  or a red audit after `verify ci` passed.
---

# Monorepo security-audit gate

## Where the signal already is

CI runs the exact root command:

```bash
pnpm run security audit
```

`scripts/security.sh` runs the root `pnpm audit --audit-level=moderate`, then
`turbo run security:audit` for every workspace. The analytics-engine task exports
its locked production requirements and scans them with `pip-audit`.

Start from the first advisory line and failed workspace. A trailing `ELIFECYCLE`
or `node_modules missing` warning after Turbo reports a failed task is usually a
consequence, not the vulnerability.

## Core principle

**Fix dependency resolution without breaking dependency contracts; never weaken
the audit.** Security advisory data can change without a repository diff, so an
unchanged lockfile may become red today after passing yesterday. Treat the
installed version and fixed-version column as a current gate failure, not as a
flaky or unrelated CI result.

`pnpm run verify ci` does not include the security audit. Conversely, a green
audit does not prove an override is runtime-compatible with every consumer.

## Fix workflow

1. Record the failed workspace, package, advisory ID, installed version, and fixed
   version from the audit output.
2. Reproduce the narrow workspace task first:

   ```bash
   pnpm --filter @zapengine/analytics-engine security:audit
   # or replace the filter with the failed JS workspace
   ```

3. Fix the correct dependency-resolution layer:
   - **Python direct dependency:** raise its constraint in
     `apps/analytics-engine/pyproject.toml`.
   - **Python transitive dependency:** add the patched floor to
     `[tool.uv].override-dependencies`, then run `uv lock` from
     `apps/analytics-engine`.
   - **npm direct shared dependency:** raise the catalog version in
     `pnpm-workspace.yaml`.
   - **npm transitive dependency:** add or tighten the patched floor under
     `pnpm-workspace.yaml` `overrides`, then run `pnpm install`.
4. Commit the generated lockfile with the constraint change. Never hand-edit
   `uv.lock` or `pnpm-lock.yaml`.
5. Rerun the focused audit, then the root audit.
6. Run `pnpm run verify ci` before handoff because an override can satisfy the
   advisory while breaking lint, tests, builds, or runtime package contracts.

For `pip-audit`, rows follow the practical shape:
`package installed-version advisory fixed-version`. If the installed version is
below the fixed floor, upgrade the resolution even when the application did not
change that package directly.

## npm override compatibility

Do not assume a patched latest major is a drop-in replacement for every transitive
consumer. Before widening an override across multiple major ranges:

1. Inspect the lockfile importers to identify which parents consume each major.
2. Check whether the patched release preserves the API expected by those parents.
3. Prefer the narrowest selector that covers vulnerable compatible ranges.
4. If an old parent cannot consume the patched major, upgrade or replace that
   parent instead of forcing an incompatible child underneath it.

ZapEngine failure signature: forcing `brace-expansion@1.x` used by
`minimatch@3` to v5 made the audit resolution look patched but broke ESLint with
`expand is not a function`. Audit coverage and consumer compatibility must both
pass; do not alternate between a vulnerable compatible lock and a patched broken
lock.

When related singleton packages must match exactly, pin them together in the
catalog. React and ReactDOM version skew can pass install but fail app-core tests
or runtime initialization.

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "The lockfile did not change, so this must be unrelated." | Advisory databases change independently; yesterday's lock can fail today. |
| "`verify ci` passed." | The security audit is a separate CI step. |
| "The audit passed, so the override is safe." | A cross-major override can still break a consumer's API contract; run the full verify loop. |
| "Force every vulnerable major to the newest patched version." | Selector coverage is not compatibility. Upgrade the parent or use a compatible patched range. |
| "The `node_modules missing` warning is the root cause." | Read the first advisory and failed workspace before trailing lifecycle warnings. |
| "Raise the audit threshold." | That hides the vulnerability and weakens the gate. |
| "Edit the lockfile to the patched version." | Change the constraint or override, then regenerate the lockfile. |
| "It is only transitive." | A transitive vulnerable version still fails the repository audit. |

## Verification

```bash
# Python failure
pnpm --filter @zapengine/analytics-engine security:audit

# Full dependency audit
pnpm run security audit

# Detect override-induced lint/test/build/runtime breakage
pnpm run verify ci
```

All commands must exit 0. If the full audit advances to another advisory, repeat
the workflow for the newly named workspace and package. If verify fails after an
override, inspect the first broken consumer before changing the override again.
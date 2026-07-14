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

**Fix dependency resolution; never weaken the audit.** Security advisory data can
change without a repository diff, so an unchanged lockfile may become red today
after passing yesterday. Treat the installed version and fixed-version column as
a current gate failure, not as a flaky or unrelated CI result.

`pnpm run verify ci` does not include the security audit. A green verify result
says nothing about dependency advisories.

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

For `pip-audit`, rows follow the practical shape:
`package installed-version advisory fixed-version`. If the installed version is
below the fixed floor, upgrade the resolution even when the application did not
change that package directly.

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "The lockfile did not change, so this must be unrelated." | Advisory databases change independently; yesterday's lock can fail today. |
| "`verify ci` passed." | The security audit is a separate CI step. |
| "The `node_modules missing` warning is the root cause." | Read the first advisory and failed workspace before trailing lifecycle warnings. |
| "Raise the audit threshold." | That hides the vulnerability and weakens the gate. |
| "Edit the lockfile to the patched version." | Change the constraint or override, then regenerate the lockfile. |
| "It is only transitive." | A transitive vulnerable version still fails the repository audit. |

## Verification

```bash
# Python failure
pnpm --filter @zapengine/analytics-engine security:audit

# Full CI-equivalent audit
pnpm run security audit
```

Both commands must exit 0. If the full audit advances to another advisory, repeat
the same workflow for the newly named workspace and package.

---
name: monorepo-security-audit
description: >-
  Use when the security-audit CI gate fails or `pnpm security audit core` /
  `pnpm audit` reports advisories — a GHSA/CVE in an npm dependency (direct or
  transitive), a Python pip-audit finding in analytics-engine, or a red
  security-audit job while `verify ci` is green. This is the recurring
  "fixCI: audit" / "upgrade exploit library" / "clear pnpm audit" task. Symptoms:
  bumping `--audit-level` to hide it, hand-editing pnpm-lock.yaml / uv.lock,
  pinning a dep back to a vulnerable-but-working version, or not knowing whether
  to use a pnpm override, the catalog, or a pyproject constraint.
---

# Monorepo security-audit gate (pnpm + uv)

## Where the error already is

**Not in `.ai-verify`.** The audit is a *separate* gate, **not** in `verify
parallel`'s `result.json` / `logs/`. The entry point is the `pnpm security audit
core` output itself — npm prints `GHSA-…` + "Patched in"; pip-audit prints the
PyPI advisory + fixed version. See below.

## Core principle

**The audit gate is SEPARATE and TWO-sided. Fix at the dependency-resolution
layer — never weaken the check.** `pnpm security audit core` is **not** part of
`verify ci`, so a green `verify ci` says nothing about it (the same gap
[monorepo-ci-debugging](../monorepo-ci-debugging/SKILL.md) flags for the audit
step). And "audit" means two independent ecosystems: **npm (pnpm)** and **Python
(uv / pip-audit)**. The fix differs by which side flags, and the lever is always
a version constraint you commit — not a hand-edited lockfile and not a loosened
threshold.

## What the gate actually runs

`pnpm security audit core` =
`pnpm audit --audit-level=moderate` (root workspace tree) **+**
`turbo run security:audit --filter=!@zapengine/mobile`, where each app's
`security:audit` is:

- JS apps (frontend, account-engine, alpha-etl, podcast-pipeline, landing-page):
  `pnpm audit --prod --audit-level=moderate`
- analytics-engine: `uv export --locked … | uvx pip-audit` (Python advisories)
- mobile: `flutter pub deps` (excluded by `:core`)

Read the failure to see **which advisory and which package**: npm prints `GHSA-…`
with a "Patched in" version; pip-audit prints the PyPI advisory + fixed version.

## Fix — by side

### npm, transitive dep (most common)

A vulnerable package pulled in indirectly. Add (or tighten) an entry in
**`pnpm-workspace.yaml` `overrides:`** — a version range → the patched floor —
then `pnpm install` to regenerate the lockfile:

```yaml
# pnpm-workspace.yaml
overrides:
  esbuild@>=0.17.0 <0.28.1: '>=0.28.1'
  file-type@>=13.0.0 <21.3.1: '>=21.3.1'
```

(Overrides **only** take effect in `pnpm-workspace.yaml`. pnpm 10.30+ no longer
reads the old `pnpm.overrides` in root `package.json` — `pnpm install` prints
`WARN … "pnpm.overrides" … ignored`. So if an override "isn't taking", it's
almost always still sitting in `package.json`; move it to `pnpm-workspace.yaml`.)

### npm, direct shared dep

If the vulnerable package is one we import directly and version via the
**catalog**, bump it in `pnpm-workspace.yaml` `catalog:` (consumers reference
`catalog:`), adding an `overrides:` floor too if transitive copies linger — then
`pnpm install`. This is what cleared the hono + react-router advisories
(`75a84ad6`: bumped catalog + override, 6 advisories).

### Python (analytics-engine)

Constrain or bump the package in **`apps/analytics-engine/pyproject.toml`**, then
`uv lock` (or `pnpm --filter @zapengine/analytics-engine run build` = `uv sync
--locked`). Examples: starlette CVE (`4339fc94`), the `uv` "exploit" upgrades.
Use `uv add`/`uv lock` — **never `pip install`** and never hand-edit `uv.lock`.

## After any fix

`pnpm install` (npm) or `uv lock` (Python) **regenerates the lockfile** — commit
that regenerated lockfile, don't hand-edit it. Then confirm:

```bash
pnpm security audit core
```

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "Bump `--audit-level` to high so the moderate advisory stops failing." | That's hiding the vuln, not fixing it. `scripts/verify-*.sh` and the audit scripts are protected — edits get reverted. |
| "Edit pnpm-lock.yaml / uv.lock directly to the patched version." | Lockfiles are generated. Add an override / catalog bump / pyproject constraint and let `pnpm install` / `uv lock` regenerate. |
| "`verify ci` passed, so the dependencies are fine." | `security audit core` is a separate gate, not in `verify ci`. Run it. |
| "Pin the dep *back* to the old version that built fine." | The old version is the vulnerable one. Move the floor forward to the patched release. |
| "It's only transitive, not something we import." | A moderate+ advisory still fails the gate. Override the transitive range to the patched floor. |
| "Web3 app — a vuln in a wallet/SDK dep is someone else's problem." | This repo guards user funds; a transitive RCE/DoS is exactly what the gate exists to catch. Patch it. |

## Verification

```bash
pnpm install              # or: uv lock  (regenerate the lockfile from your constraint)
pnpm security audit core  # the separate gate — must exit 0
```

Then push and read the CI security-audit job. If it advances to a new advisory,
repeat — multiple advisories often surface together.

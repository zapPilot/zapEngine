---
name: monorepo-dup-check
description: >-
  Use when the `dup:check` CI gate (jscpd duplication) fails — clones reported in
  a workspace's `lib`/`src`, a `dup:check` that suddenly fails on code you didn't
  touch (a time-boxed duplicate "quarantine" expired), or you're deciding whether
  to merge a clone, jscpd:ignore it, or extract a shared helper. Recurring
  "fixCI: dedupe" / "clear dup-debt to pass dup:check" / "eliminate jscpd clones"
  task, both TS (frontend/account-engine/landing-page) and Python
  (analytics-engine). Symptoms: bumping the jscpd threshold to pass, copy-pasting
  then re-quarantining, "the gate failed but I didn't change that file".
---

# Monorepo duplication gate (jscpd `dup:check`)

## Core principle

**A `dup:check` failure has exactly two legitimate resolutions: merge the real
clone, or declare an intentional one ignored — with a reason. Never raise the
threshold to make duplication "disappear."** The gate measures copy-paste, and
the only honest outcomes are "I removed the duplication" or "this duplication is
irreducible and here's why."

## What the gate runs

`turbo run dup:check` → each workspace's `dup:check` =
`node scripts/lint/run-jscpd.mjs <dir>` (frontend/mobile `lib`, analytics-engine
& others `src`). The runner merges a shared root config with a **local
`.jscpd.json`** that may only set `ignore`, `ignorePattern`, `format`, `$schema`
(other keys are rejected — threshold etc. are centralized). It passes when the
duplicated-token **`threshold`** isn't exceeded.

Read the jscpd output: it names the **two files + line ranges** of each clone.
That's what to act on.

## Diagnose: real debt or intentional?

- **Real clone** — the same logic/algorithm copy-pasted (e.g. a rolling-window
  DMA computation in two services, two strategies sharing a recommendation
  builder). → extract a shared function.
- **Irreducible by design** — identical *signatures* that can't be merged without
  hurting clarity: an overridden method signature, a `BaseWriter` subclass shape,
  parallel test fixtures. → ignore with a reason.

## Fix — by case

### Merge the real clone (behavior-preserving)

Extract the duplicated body into one shared function/module and have both sites
call it. This is the default and the right fix most of the time. Examples:
`8c8d7546` (stock + token DMA → shared `computeRollingDmaMetrics`), `58514fb9`
(metrics + walk_forward clones), `2decbc0e` (two identical
`_build_recommendation_context` calls merged into one).

### Ignore an intentional clone

Either an `ignore` / `ignorePattern` entry in the workspace's `.jscpd.json`, or
inline `jscpd:ignore-start` … `jscpd:ignore-end` comments around the block.
**Always say why** (e.g. "override signature, cannot be merged" — `2decbc0e`).

### A "quarantine" expired — the spontaneous failure

The repo time-boxes known dup-debt with **dated ignore entries the team commits
to removing**. When that date passes and the ignore lapses, `dup:check` starts
failing **on code you never touched** (`2decbc0e`: "strategy duplicate quarantine
expired 2026-06-05"). This is by design — the grace period is over. **Eliminate
the clones now; do not re-quarantine to kick the can.** If you genuinely can't
merge yet, that's a team decision, not a silent re-extension.

## Reproduce locally

```bash
pnpm dup:check                                   # all workspaces (turbo)
pnpm --filter @zapengine/<pkg> run dup:check     # one workspace
# the named clones live in <pkg>/.jscpd/jscpd-report.json after a run
```

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "Raise the `threshold` so the duplication passes." | That's hiding copy-paste, not removing it. Threshold is centralized in the shared config — local `.jscpd.json` can't even set it. |
| "The gate failed but I didn't change that file — it's flaky." | Not flaky: a time-boxed ignore (quarantine) expired. Merge the clones it was covering. |
| "Re-add the dated ignore and move on." | Re-quarantining defeats the deadline. Eliminate the duplication, or make it an explicit team decision. |
| "Copy-paste now, I'll dedupe later." | The gate fails immediately on the new clone. Extract the shared helper as you write it. |
| "jscpd:ignore everything that trips it." | Only intentional, irreducible duplication gets ignored — with a stated reason. Real clones get merged. |

## Verification

```bash
pnpm --filter @zapengine/<pkg> run dup:check   # the workspace that failed → exit 0
pnpm dup:check                                  # then the whole gate
```

Python-side specifics (mypy/ruff interactions, the analytics dup-debt history)
live in [analytics-engine-ci-debugging](../analytics-engine-ci-debugging/SKILL.md);
this skill owns the jscpd mechanism repo-wide.

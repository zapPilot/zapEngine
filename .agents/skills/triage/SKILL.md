---
name: triage
description: >-
  Use with a strong model to inspect operational and repository signals, decide
  what is real and actionable, and turn only bounded low-risk work into weak-agent
  backlog issues. Does not implement code fixes.
---

# Triage

Use this as the single strong-model entry point for operational triage. The goal is
judgement, not implementation: establish what is happening, decide who should own it,
and leave weak models a small verifiable contract when they can safely do the work.

Use the repository-local `zap-pilot-ops` MCP for production evidence. Repository
logs and code are supporting evidence, never substitutes for production state.
Unknown is unknown, never healthy.

## Run order

1. Find the single open report issue and read its latest coverage comment and
   fingerprints. If zero or multiple exist, report that and create nothing.

   ```bash
   gh issue list --label triage-log --state open
   ```

2. Call `ops_status` and `ops_backlog`. At ready >=10 create no new backlog work; at
   ready >=5 skip hygiene. Call `ops_investigate` on each priority signal and read
   `remediation` first: non-empty `blockers` means operator or defer,
   `inspectionCoverage: no-inspector` forbids calling it production-verified, and
   non-zero `exposure.aumAtRiskUsd` or `customerImpact` means report only.

3. Inspect Sentry across the full last 30 days, following every `nextCursor`:

   ```text
   ops_inspect_signal { fingerprint: "sentry:issues/organization",
     sentry: { start, end, query: "is:unresolved", cursor } }
   ```

   `start` and `end` must be supplied together, ISO-8601 with a timezone and
   `start < end`, or the window silently falls back to 24h. Also inspect
   `sentry:stale-unresolved/*`; for one issue use `query: "issue:<SHORT-ID>"`.
   Report pages, projects and truncation. A healthy 24h window does not mean
   there is no unresolved work.

4. Inspect `github-actions:recent-failure/*` jobs, failed steps, logs and
   `commitsSinceFailure`. A later commit is not proof of repair; a later green run on
   the relevant main SHA is recovery evidence. A failure on the current `origin/main`
   HEAD gates every `deploy-fly` job and the `workflow_run` Vercel deploy, and every
   worker branch cut from `origin/main` inherits it, so no worker PR can reach seven
   green checks: list it first under Attention. Create a backlog item only when the
   whole fix sits inside worker scope — no protected path, no threshold, no security
   or lockfile change. Otherwise file an operator issue for a human to repair.

5. When ready <5, inspect at most three hygiene candidates against current green-main
   artifacts, reading the coverage-summary artifact into a unique temporary directory
   outside the repository. Run lint only where the script lacks `--max-warnings 0`,
   and deadcode only where it lacks `--treat-config-hints-as-errors`. Scan files
   changed in the last seven days with the doc-freshness and comment-discipline
   skills, recording `unscanned` when unavailable. Never mine jscpd: its threshold is 0.

6. Read open operator issues and comment only when the evidence changed; never
   edit their bodies or labels. Deduplicate every candidate, classify it, then add
   exactly one coverage comment to `triage-log`.

## Classification

| Class                      | Use when                                                                                                              | Action                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `agent-backlog`            | Root cause is repo-visible, low risk, locally verifiable, normally one workspace and <=3 files including tests        | `ops_backlog_create`                                    |
| `operator`                 | Credentials, spend, release/redispatch, product/pricing/legal choice, unknown root cause, or high-blast-radius change | create/comment operator issue                           |
| `sentry-cleanup-candidate` | Fix is on main, deployed to the affected runtime, and post-deploy evidence is quiet                                   | report; resolve only with the explicit delegation below |
| `ignore`                   | Verified transient/dev noise, superseded/abandoned work, inactive priority-account noise, or non-actionable history   | record category only                                    |

Never hand weak agents secrets, auth/authorization changes, schema or migrations,
workflow/environment changes, threshold weakening, wallet/investment/portfolio
semantics, alert suppression, agent/harness configuration, or unresolved product
choices. Correctness that depends on judgement rather than a deterministic local
acceptance check is not weak-agent work.

## Weak-agent issue contract

Title: `<area>: <symptom>` (<=70 characters). Every backlog issue must contain:

- Problem: evidence/source URL, count, environment, first and last seen;
- an observable expected outcome;
- `## Relevant files / area` listing every path the fix touches, tests included,
  each verified with `rg --files`. The merge gate admits only those paths plus
  `apps|packages/<area>/`, so an unlisted file denies the worker's PR;
- local acceptance commands or named tests, never a production observation or a
  frozen warning/event count;
- out of scope, always excluding thresholds, workflow/env/migrations and signal
  suppression;
- `area`, `effort` and a stable fingerprint.

`area` must be a workspace directory name; `repo` is denied by the merge gate.
`docs` and `knip` are the only areas that widen scope beyond one workspace.

Effort: `xs` one mechanical file; `s` one workspace and <=3 files including
tests; `m` is exceptional, at most one per run and usually operator work.

Fingerprint `triage:<source>:<key>`, for example `triage:sentry:PROJECT-ID`,
`triage:ci:workflow:job:step`, `triage:lint:workspace:warnings`,
`triage:knip:workspace:hints`, `triage:docs:path`. Use a `:rYYYYMMDD` recurrence
suffix only with evidence of a genuinely new occurrence.

Operator issue: `gh issue create --label operator --label area:<slug>`, title
`[operator] <decision>`, sections Decision needed, Evidence, Options, Fingerprint.
Use existing labels only; never create a label.

## Deduplication and caps

Before creating work check the live backlog fingerprint, then:

```bash
gh issue list --state all --search "<fingerprint> in:body"
```

Skip open items, items closed within 14 days and anything marked wontfix, plus merged
PRs carrying the fingerprint and open PRs closing the same issue. An open operator
issue for the same workflow or Sentry short ID also covers it. Search indexing is
delayed, so keep an in-run set too. `created:false` is a dedupe result, not a new issue.

Never create more than 10 backlog items, 3 per area, 3 hygiene items, 1 `effort:m` or
3 operator issues in one run. Stop backlog creation when ready reaches 10, stop on the
first create error and report the remaining candidates. When the server refuses
because its snapshot is unavailable or truncated, stop; never retry without it.

## Sentry cleanup

Triage may classify Sentry history but must not use resolution to make the board
look clean. The verified-fix rail belongs to the server: `ops_claim_resolution`
needs an incident whose fix was registered through `ops:operator --record-fix`,
reached `verified`, and has a passing verification from the last five minutes —
which a triage conversation cannot produce. Only the `delegatedBy` rail is
reachable here, and the server still refuses an issue that fired within 24 hours.

When the user explicitly delegates cleanup, resolve one inspected issue at a time
through `ops_resolve_sentry_issue`, setting `delegatedBy` only to the person who
asked in this conversation. `reason` must name the fix PR or commit, the deployed
runtime and the observation evidence. Never forge delegation. See
[REFERENCE.md](REFERENCE.md).

## Report

Post exactly one `triage-log` comment and read it back. Sections:
`## Triage YYYY-MM-DD`, `### Coverage`, `### Created (agent-backlog)`,
`### Filed (operator)`, `### Skipped (dedupe)`, `### Sentry cleanup candidates`,
`### Ignored`, `### Attention`. Coverage names the Sentry count/window/pages/projects,
recent main failures, backlog ready/working/blocked, unknown providers and skipped
scans, with evidence URLs and fingerprints. Never report partial pagination as a total.

Refresh `ops_backlog force:true` after writes and reconcile the ready-count delta
against created items and concurrent claims. A same-day rerun must not duplicate
fingerprints.

## Hard rules

Normal triage writes only `ops_backlog_create`, operator issues/comments and the
triage-log comment. It does not edit repository files, create implementation PRs,
claim/release backlog work, push, merge, deploy, redispatch or spend money. Sentry
resolution is the sole exception and requires the delegation and gates above.

Do not fix an easy issue inline. Preserve it as bounded work for `worker`; the
separation between judgement and execution is the point of this skill.

## Rationalizations — STOP

| Temptation                        | Required behavior                               |
| --------------------------------- | ----------------------------------------------- |
| 24h is green                      | Inspect all 30d pages                           |
| I can fix this in two lines       | This run writes issues only                     |
| The worker can find the files     | No verified path list, no backlog item          |
| The worker will work out the area | An unlisted path is denied by the merge gate    |
| Update the operator issue         | Add an evidence comment only                    |
| Acceptance is zero hints          | Name the local command, not a stale count       |
| Main CI is ordinary backlog       | Attention first; operator unless fully in scope |

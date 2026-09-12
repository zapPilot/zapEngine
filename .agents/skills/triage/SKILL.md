---
name: triage
description: >-
  Use with a strong model to inspect operational and repository signals, decide
  what is real and actionable, and turn only bounded low-risk work into weak-agent
  backlog issues. Does not implement code fixes.
---

# Triage

Use this as the single strong-model entry point for operational triage. The goal
is judgement, not implementation: establish what is happening, decide who should
own it, and leave weak models a small verifiable contract when they can safely do
the work.

Use the repository-local `zap-pilot-ops` MCP for production evidence. Repository
logs and code are supporting evidence, never substitutes for production state.
Unknown is unknown, never healthy.

## Run order

1. Find the single open `triage-log` issue and read its latest coverage comment
   and fingerprints. If zero or multiple exist, report the problem and do not
   create work.
2. Call `ops_status` and `ops_backlog`. At ready >=10 create no new backlog work;
   at ready >=5 skip hygiene discovery.
3. Inspect Sentry across the full last 30 days with explicit start/end and
   `query: is:unresolved`; follow every `nextCursor`. Inspect stale-unresolved
   signals too. A healthy 24h window does not mean there is no unresolved work.
4. Inspect `github-actions:recent-failure/*` jobs, failed steps, logs and
   `commitsSinceFailure`. A later commit is not proof of repair; a later green run
   on the relevant main SHA is recovery evidence. CI failures are ordinary triage
   candidates: create weak backlog work when the root cause is bounded and safe.
5. When ready <5, inspect at most three hygiene candidates using existing repo
   playbooks and current green-main artifacts. Do not manufacture work from stale
   warning counts.
6. Read open operator issues, deduplicate every candidate, classify it, then add
   exactly one coverage comment to `triage-log`.

## Classification

| Class | Use when | Action |
| --- | --- | --- |
| `agent-backlog` | Root cause is repo-visible, low risk, locally verifiable, normally one workspace and <=3 files including tests | `ops_backlog_create` |
| `operator` | Credentials, spend, release/redispatch, product/pricing/legal choice, unknown root cause, or high-blast-radius change | create/comment operator issue |
| `sentry-cleanup-candidate` | Fix is on main, deployed to the affected runtime, and post-deploy evidence is quiet | report; resolve only with the explicit delegation below |
| `ignore` | Verified transient/dev noise, superseded/abandoned work, inactive priority-account noise, or non-actionable history | record category only |

Never hand weak agents secrets, auth/authorization changes, schema or migrations,
workflow/environment changes, threshold weakening, wallet/investment/portfolio
semantics, alert suppression, agent/harness configuration, or unresolved product
choices. If correctness depends on judgement rather than a deterministic local
acceptance check, it is not weak-agent work.

## Weak-agent issue contract

Title: `<area>: <symptom>` (<=70 characters).

Every backlog issue must contain:

- evidence/source URL and current symptom;
- observable expected outcome;
- verified relevant paths (`rg --files`);
- local acceptance commands or named tests;
- explicit out-of-scope boundaries;
- `area`, `effort` (`xs`/`s`/`m`) and stable fingerprint.

Prefer `xs`/`s`. `m` is exceptional and should usually become operator work.
Acceptance must not depend on production secrets, live infrastructure, or a frozen
warning/event count.

Fingerprint: `triage:<source>:<key>`; use a dated recurrence suffix only when new
evidence proves a genuinely new occurrence.

## Deduplication and caps

Before creating work, check the live backlog fingerprint, all issues containing
the fingerprint, merged PRs and open PRs closing the same issue. Skip open items,
items closed within 14 days, and anything marked wontfix. Keep an in-run set too
because GitHub search indexing is delayed.

Never create more than 10 backlog items, 3 per area, 3 hygiene items, 1 effort:m,
or 3 operator issues in one run. Stop backlog creation when ready reaches 10.
Stop on the first create error and report remaining candidates instead of guessing.

## Sentry cleanup

Triage may classify Sentry history but must not use resolution to make the board
look clean. A verified-fix resolution requires understood root cause, fix on the
relevant mainline, that exact fixed version deployed/released, and at least 24h
with zero matching events after the fixed version became active.

If the user explicitly delegates Sentry cleanup, resolve one inspected issue at a
time through `ops_resolve_sentry_issue`. For dead history, set `delegatedBy` only
when a person actually made that decision in the current conversation. See
[REFERENCE.md](REFERENCE.md). Never forge delegation.

## Report

Post exactly one `triage-log` comment with Coverage, Created, Operator, Cleanup
candidates/resolved (when explicitly delegated), Skipped, Ignored and Attention.
Coverage names the Sentry window/pages/projects, recent main failures, backlog
ready/working/blocked, unknown providers and skipped scans. Never report partial
pagination as a total.

Refresh `ops_backlog force:true` after writes and reconcile the ready-count delta.
A same-day rerun must not duplicate fingerprints.

## Hard rules

Normal triage writes only `ops_backlog_create`, operator issues/comments and the
triage-log comment. It does not edit repository files, create implementation PRs,
claim/release backlog work, push, merge, deploy, redispatch or spend money.
Sentry resolution is the sole exception and requires the explicit delegation and
verification gates above.

Do not fix an easy issue inline. Preserve it as bounded work for `worker`; the
separation between judgement and execution is the point of this skill.

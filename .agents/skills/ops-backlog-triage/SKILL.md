---
name: ops-backlog-triage
description: >-
  Use for a manual strong-model triage of operational signals into bounded
  weak-agent backlog issues, operator decisions and one coverage audit comment.
  Covers Sentry 30d pagination, recent main failures and fingerprint deduplication.
---

# Ops backlog triage

## Core principle

Create only work a weak agent can finish and verify locally. This run writes
issues and comments only. The user selects the model and invokes this skill in
Claude Code, OpenCode or Codex; there is no scheduled or headless runner.
Use bare MCP tool names below through the harness's configured zap-pilot-ops server.

## Run order

1. Find the open report issue: `gh issue list --label triage-log --state open`.
   Require exactly one and read its latest comments/fingerprints. If absent or
   ambiguous, stop and print the coverage report without creating issues.
2. Call `ops_status` and `ops_backlog`. Unknown is unknown, never healthy.
   At ready ≥10 create no backlog work; at ready ≥5 skip hygiene.
3. Inspect Sentry over the last 30 days with `ops_inspect_signal`, fingerprint
   `sentry:issues/organization`, explicit `sentry.start` / `sentry.end` and
   `sentry.query: is:unresolved`. Follow every `nextCursor`. Also inspect
   `sentry:stale-unresolved/*` signals (default 30d). For frames, use a query
   such as `issue:PODCAST-PIPELINE-1C`. Report pages, projects and truncation.
   A healthy 24h window never means there is no unresolved work.
4. Investigate `github-actions:recent-failure/*`, then inspect jobs/steps/logs
   and `commitsSinceFailure`. Repository logs are not production verification.
   A failed main HEAD for ci.yml is Attention for `/goal-ci-fix`, not backlog.
   Later commits alone do not prove a fix. Later success is recovery evidence;
   no subsequent run means unverified. Manual release redispatch is operator work.
5. If ready <5, inspect at most three hygiene candidates. Read the latest green
   main CI coverage-summary artifact into a unique temporary directory outside
   the repository. Only run lint where the script lacks `--max-warnings 0`,
   or deadcode where it lacks `--treat-config-hints-as-errors`. Inspect changed
   files from seven days for doc freshness/comment discipline using those skills
   if available; otherwise record unscanned. Do not mine jscpd: its threshold is 0.
6. Read open operator issues. Comment only when evidence changed; do not edit
   their bodies or labels. Classify, deduplicate and create within the caps below.
7. Add exactly one comment to triage-log, even if nothing was created.

## Classification and issue contract

| Class                    | Required evidence and action                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| agent-backlog            | Repo-visible root cause; one workspace and ≤3 files including tests; local acceptance commands; `ops_backlog_create` with area, effort and fingerprint  |
| operator                 | Credentials, spending, redispatch, unknown root cause or product/pricing/legal decision; `gh issue create --label operator --label area:<slug>`         |
| sentry-cleanup-candidate | Fix on main, runtime on that fix and quiet post-deploy observation; report only                                                                         |
| ignore                   | Verified transient network/dev noise, superseded or abandoned render, inactive priority account, or isolated event without a repo path; record category |

Never produce weak-agent work involving secrets, auth, schema/migration,
workflows, environment manifests, threshold weakening, wallet/investment
semantics, alert suppression or unresolved product decisions.

Backlog title: `<area>: <symptom>`, at most 70 characters. Problem includes
source URL, count, environment and first/last seen. Expected outcome describes
observable behavior. Every acceptance item is a local command or named test,
not a production observation or frozen warning count. Relevant files must name
at least one existing path; verify using `rg --files`. Out of scope excludes
thresholds, workflow/env/migrations and signal suppression.

Effort: xs = one mechanical file; s = one workspace, ≤3 files including tests;
m = more files or judgement, at most one per run, preferably operator.
Fingerprint: `triage:<source>:<key>`; examples `triage:sentry:PROJECT-ID`,
`triage:ci:workflow:job:step`, `triage:lint:workspace:warnings`,
`triage:knip:workspace:hints`, `triage:docs:path`. A verified recurrence after
repair may use `:rYYYYMMDD` with evidence that it is a new occurrence.

Operator issue title: `[operator] <decision>`. Sections: Decision needed,
Evidence, Options, Fingerprint. Use an existing area label; never create labels.

## Deduplication and caps

Before each create:

1. Check the current open backlog fingerprint; the server refreshes and refuses
   creation if its snapshot is unavailable or truncated.
2. `gh issue list --state all --search "<fingerprint> in:body"`: skip open,
   closed within 14 days, and anything marked wontfix regardless of age.
3. Search merged PRs for the fingerprint and open PRs for `Fixes #<issue>`.
4. An open operator issue for the same workflow or Sentry short ID covers it.

Search indexing is delayed: keep an in-run set too. `created:false` is dedupe,
not a new issue. Stop on the first create error and report remaining candidates.
Never exceed 10 new backlog issues, 3 per area, 3 hygiene, 1 effort:m, or 3
operator issues per run. Stop backlog creation when ready reaches 10.

## Report and verification

Comment sections: `## Triage YYYY-MM-DD`, `### Coverage`, Created
(agent-backlog), Filed (operator), Skipped (dedupe), Sentry cleanup candidates,
Ignored, Attention. Coverage names Sentry count/window/pages/projects, recent
main failures, backlog ready/working/blocked, unknown providers and skipped scans.
Include evidence URLs and fingerprints; never report partial pagination as totals.
Read the posted comment back. Refresh `ops_backlog force:true`; reconcile its
ready change with created items and concurrent claims. New issues must carry
agent-backlog, agent:weak, risk:low, area:_ and effort:_. A same-day rerun must
not duplicate existing fingerprints.

## Hard rules

Allowed writes: `ops_backlog_create`, `gh issue create`, `gh issue comment`.
Never claim/release backlog, resolve Sentry, edit/close issues, change labels,
create/merge PRs, edit files, commit or push. Operational unknowns must be reported.

## Rationalizations — STOP

| Temptation                    | Required behavior                         |
| ----------------------------- | ----------------------------------------- |
| 24h is green                  | Inspect all 30d pages                     |
| I can fix this in two lines   | This run writes issues only               |
| The worker can find the files | No verified path, no backlog item         |
| Update the operator issue     | Add an evidence comment only              |
| Acceptance is zero hints      | Name the local command, not a stale count |
| Main CI is backlog            | Put it in Attention for CI repair         |

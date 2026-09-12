---
name: ops-incident-remediation
description: >-
  Use when asked to inspect production operational health, clean up completed
  Sentry incidents, or fix a simple high-confidence production issue through
  the zap-pilot-ops MCP. Covers ops_status, ops_investigate,
  ops_inspect_signal, bounded Sentry resolution, deployment verification, and
  one-at-a-time low-blast-radius fixes.
---

# Ops incident remediation

Use the repository-local `zap-pilot-ops` MCP as the source of production
operational evidence. Do not infer production health from code or Git history
alone.

## Core principle

**Resolve only production-verified fixes. Fix at most one new high-confidence,
low-blast-radius incident per run.**

Merged is not deployed. Deployed is not verified. Quiet time before the fixed
version reached production does not count toward the observation window.

## Inspect first

Start broad, then narrow:

1. Call `ops_status`.
2. Follow the highest-priority actionable signals with `ops_investigate`.
3. Use `ops_inspect_signal` only when provider-specific evidence is needed. For
   Sentry, use it to obtain the numeric issue ID and recent event evidence.
4. Treat provider state `unknown` as unknown, never healthy.
5. Before reporting no Sentry work, inspect all 30d unresolved pages with explicit
   start/end and nextCursor. A healthy 24h signal only means no recent activity;
   stale-unresolved signals are candidates for classification, never proof of repair.
6. Use `force: true` only when fresh provider reads are needed after a fix,
   deploy, or during active triage.

## Classify unresolved Sentry issues

Classify each inspected issue before taking action:

| State                  | Meaning                                                            | Action                                       |
| ---------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| `unfixed`              | Root cause is not fixed                                            | Candidate for repair                         |
| `fixed_pending_deploy` | Fix is merged but affected production runtime is still old         | Keep open                                    |
| `deployed_observing`   | Fixed version is deployed but observation window is incomplete     | Keep open                                    |
| `resolvable`           | Fix is deployed and production evidence satisfies the resolve gate | Resolve — only with explicit user delegation |
| `defer`                | Root cause, behavior, or safe fix is ambiguous                     | Leave unchanged and explain                  |

### Resolve gate

An issue is `resolvable` only when all are true:

- the root cause is understood;
- the fix is present on the relevant mainline code;
- the fixed version is deployed or released to the production runtime that
  generated the issue;
- no new matching production event has appeared after that deployment/release;
- the post-deploy observation window has completed.

Default observation window: **24 hours with zero matching events after the
fixed production version became active**.

For mobile incidents, merging to `main` is insufficient. Wait until a release
containing the fix is actually distributed, then require the same 24-hour
post-release zero-event window.

Never resolve merely because an issue has been quiet for 24 hours when the fix
has not yet reached production.

Resolving also requires explicit user delegation (see "Recommended agent flow"
in `apps/control-center/MCP.md`): the user asked to close/resolve that issue
or explicitly delegated Sentry cleanup. Without delegation, treat `resolvable`
as ready but do not call `ops_resolve_sentry_issue`; report it instead. Pure
`inspect production health` never auto-resolves.

### Resolution rail

Use production verification, or explicit human delegation for dead history.
Both require the server quiet gate; see [REFERENCE.md](REFERENCE.md).

## Clean up completed incidents

Resolve inspected issues one at a time only after verification and delegation
pass. Include fix PR/commit, deployed runtime, regression check and post-deploy
observation evidence. Never hide diagnostics still producing events unless an
explicit verified policy says that exact event is no longer an issue.

## Recent main failures

Inspect recent-failure signals for jobs/steps/logs and commitsSinceFailure;
`gh run view --log-failed` is also repository evidence, not production verification.
Zero commits after failure means failed main HEAD: ci.yml goes to CI repair.
Later commits plus a later green run mean recovery; later commits alone remain
unverified. Manual release workflows require an operator issue, never redispatch.

## Choose at most one new repair

After cleanup, rank remaining incidents by impact, confidence, simplicity, and
blast radius. Repair exactly one new incident only when the root cause and safe
change are both high confidence.

`operator.actions[].allowed:false` describes the server runner, not permission
to deliver a reviewed PR through this skill.

Read the `remediation` block on the `ops_investigate` packet first. Any
`remediation.blockers` entry means defer and report; `no-inspector` coverage
forbids calling the incident production-verified; non-zero AUM in
`remediation.exposure` or `customerImpact` is report-only.

Candidates: deterministic invalid/null guards, bounded external-call handling,
verified stale paths/config, or local invariant failures with regression tests.
Never undertake architecture, data/schema migrations, auth/secret boundaries,
wallet/investment/portfolio semantics, broad retry/timeout/concurrency/scheduling
policy, threshold weakening, alert suppression or unresolved product decisions.

If no issue meets the bar, make no code change. Report the best candidates and
why each was deferred.

## Unreachable failures

Superseded/abandoned renders and inactive priority accounts are not backlog.
See [REFERENCE.md](REFERENCE.md) for the producer fence and resolution rails.

## Fix workflow

For the single selected incident, read scoped rules, implementation and history;
fix the root cause with a regression test and run Verification below. Re-inspect
with force only after deployment when fresh evidence is useful. Tests or merge
do not authorize resolution: retain fixed_pending_deploy/deployed_observing until
the resolve gate passes.

Follow root `AGENTS.md` for working-tree, history, PR, and preservation rules.

## Verification

Operational: `ops_status` → `ops_investigate <fingerprint>` →
`ops_inspect_signal` (Sentry issueId) → `ops_resolve_sentry_issue` (one ID; see
"Remediation facts" in `apps/control-center/MCP.md`, `scripts/ops-mcp.mjs` pins `prod`).

Local post-fix: `pnpm turbo run test --filter=@zapengine/<pkg>`,
`pnpm turbo run type-check --filter=@zapengine/<pkg>`,
`bash scripts/verify-jobs.sh format repo contracts` /
`bash scripts/verify-jobs.sh type-check lint`.

CI: `quick-gates` = `format repo contracts`; `code-quality` =
`type-check lint deadcode dup` — keep green, never weaken gates.

## Rationalizations — STOP

| Temptation                                             | Required behavior                                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| "It is merged, so it is fixed in production."          | Verify the affected production runtime is on the fixed version.                                 |
| "There have been no events for 24 hours."              | Count only time after the fixed version became active in production.                            |
| "The fallback looks expected."                         | Keep it open unless repository and production evidence prove the event is no longer actionable. |
| "Several issues look easy."                            | Fix at most one new incident in this run.                                                       |
| "Downgrading or suppressing the event is enough."      | Fix the underlying behavior; do not hide the signal.                                            |
| "The mobile fix is on main."                           | Wait for an actual distributed release, then observe it.                                        |
| "The provider is unknown, so there is nothing wrong."  | Unknown is not healthy.                                                                         |
| "No evidence gaps came back, so evidence is complete." | `no-inspector` means nothing was gathered; only `inspected` is evidence.                        |
| "The resolve gate is met, so resolve everything."      | Also require explicit user delegation; otherwise report ready but unresolved.                   |
| "Twenty failed renders each need one bounded retry."   | Check visual version and `abandoned_at` first; unreachable rows are an emitter bug, not work.   |

## Completion report

Start with Coverage: Sentry unresolved N over 30d (pages and projects), recent
main failures M, backlog ready/working/blocked and unknown providers.
Then give a compact operational summary grouped as applicable:

- **Resolved** — issue ID, evidence for the resolve gate.
- **Fixed pending deploy** — fix commit/PR and the production runtime still
  awaiting it.
- **Deployed observing** — deployed/released version and remaining observation
  requirement.
- **Fixed this run** — root cause, patch, tests, and current operational state.
- **Deferred** — concise reason the issue was not safe enough to repair or
  resolve.

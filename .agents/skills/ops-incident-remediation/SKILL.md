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
5. Use `force: true` only when fresh provider reads are needed after a fix,
   deploy, or during active triage.

## Classify unresolved Sentry issues

Classify each inspected issue before taking action:

| State                  | Meaning                                                            | Action                      |
| ---------------------- | ------------------------------------------------------------------ | --------------------------- |
| `unfixed`              | Root cause is not fixed                                            | Candidate for repair        |
| `fixed_pending_deploy` | Fix is merged but affected production runtime is still old         | Keep open                   |
| `deployed_observing`   | Fixed version is deployed but observation window is incomplete     | Keep open                   |
| `resolvable`           | Fix is deployed and production evidence satisfies the resolve gate | Resolve — only with explicit user delegation |
| `defer`                | Root cause, behavior, or safe fix is ambiguous                     | Leave unchanged and explain |

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

Resolving also requires explicit user delegation (see
`apps/control-center/MCP.md:37`): the user asked to close/resolve that issue
or explicitly delegated Sentry cleanup. Without delegation, treat `resolvable`
as ready but do not call `ops_resolve_sentry_issue`; report it instead. Pure
`inspect production health` never auto-resolves.

## Clean up completed incidents

Only when the resolve gate passes **and** the delegation gate passes, resolve
the inspected issues before starting a new repair. Use
`ops_resolve_sentry_issue` one issue at a time and include a concise
evidence-based reason containing, when available:

- fix commit or PR;
- production deploy/release identity or timestamp;
- regression verification;
- post-deploy observation evidence.

Do not use Sentry resolution to hide expected-but-still-active diagnostics. If
an alert is still producing events, leave it open unless the repository has an
explicitly verified policy saying that exact event should no longer be treated
as an issue.

## Choose at most one new repair

After cleanup, rank remaining incidents by impact, confidence, simplicity, and
blast radius. Repair exactly one new incident only when the root cause and safe
change are both high confidence.

Good autonomous candidates include:

- deterministic invalid/null input handling;
- localized guards around an external call;
- stale config, path, or environment mapping with clear repository evidence;
- obvious exception handling bugs;
- a small invariant violation with a direct regression test.

Do not autonomously undertake:

- architecture refactors;
- database or data migrations;
- authentication, authorization, or secret-boundary changes;
- wallet, transaction, investment, or portfolio semantic changes;
- broad retry, timeout, concurrency, or scheduling policy changes;
- threshold weakening or alert suppression;
- changes whose correctness depends on an unresolved product decision.

If no issue meets the bar, make no code change. Report the best candidates and
why each was deferred.

## Fix workflow

For the single selected incident:

1. Read the relevant implementation, tests, scoped instructions, and recent
   history needed to establish the root cause.
2. Make the smallest change that fixes the underlying behavior rather than
   silencing the error.
3. Add or update a regression test that reproduces the failure where practical.
4. Run the narrowest repo-native checks: `pnpm turbo run test --filter=@zapengine/<pkg>`,
   `pnpm turbo run type-check --filter=@zapengine/<pkg>`,
   `bash scripts/verify-jobs.sh format` (widen to
   `bash scripts/verify-jobs.sh type-check lint` for shared packages).
5. Re-inspect with `force: true` only after deploy/release when fresh evidence is useful.
6. Do not resolve just because tests pass or the fix is merged. Keep
   `fixed_pending_deploy`/`deployed_observing` until the resolve gate passes.

Follow root `AGENTS.md` for working-tree, history, PR, and preservation rules.

## Verification

Operational: `ops_status` → `ops_investigate <fingerprint>` →
`ops_inspect_signal` (Sentry issueId) → `ops_resolve_sentry_issue` (one ID, see
`apps/control-center/MCP.md:32-57`; launcher `scripts/ops-mcp.mjs` pins `prod`).

Local post-fix: `pnpm turbo run test --filter=@zapengine/<pkg>`,
`pnpm turbo run type-check --filter=@zapengine/<pkg>`,
`bash scripts/verify-jobs.sh format repo contracts` /
`bash scripts/verify-jobs.sh type-check lint`.

CI: `quick-gates` = `format repo contracts`; `code-quality` =
`type-check lint deadcode dup` — keep green, never weaken gates.

## Rationalizations — STOP

| Temptation                                            | Required behavior                                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| "It is merged, so it is fixed in production."         | Verify the affected production runtime is on the fixed version.                                 |
| "There have been no events for 24 hours."             | Count only time after the fixed version became active in production.                            |
| "The fallback looks expected."                        | Keep it open unless repository and production evidence prove the event is no longer actionable. |
| "Several issues look easy."                           | Fix at most one new incident in this run.                                                       |
| "Downgrading or suppressing the event is enough."     | Fix the underlying behavior; do not hide the signal.                                            |
| "The mobile fix is on main."                          | Wait for an actual distributed release, then observe it.                                        |
| "The provider is unknown, so there is nothing wrong." | Unknown is not healthy.                                                                         |
| "The resolve gate is met, so resolve everything."     | Also require explicit user delegation; otherwise report ready but unresolved.                |

## Completion report

End each run with a compact operational summary grouped as applicable:

- **Resolved** — issue ID, evidence for the resolve gate.
- **Fixed pending deploy** — fix commit/PR and the production runtime still
  awaiting it.
- **Deployed observing** — deployed/released version and remaining observation
  requirement.
- **Fixed this run** — root cause, patch, tests, and current operational state.
- **Deferred** — concise reason the issue was not safe enough to repair or
  resolve.

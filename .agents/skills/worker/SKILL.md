---
name: worker
description: >-
  Use with a weak/cheap model to consume already-triaged low-risk engineering
  work. Claims bounded backlog items, applies the smallest safe fix, verifies it,
  opens reviewed PRs and merges only through the deterministic backlog merge gate.
---

# Worker

This is the single weak-model execution entry point. Do not discover company
priorities or redesign the task. Consume work that `triage` already reduced to a
small, locally verifiable contract.

GitHub Issues is the work source of truth. Use MCP claim/release; never hand-edit
backlog labels or close issues manually.

## Run order

0. Sweep your open PRs marked `Agent-Backlog-PR: true`. Run the deterministic
   merge check on each. Merge only allowed PRs; repair ordinary local/CI failures
   in their existing worktree when they remain within worker scope.
1. Read root/scoped `AGENTS.md`, verify the expected GitHub identity and MCP
   reachability, then find exactly one open `triage-log` issue.
2. Claim through `ops_backlog_claim` using a stable
   `<harness>-worker@<hostname>` agentId. Optional user input may restrict by
   `area:<slug>` or request `#<issue>`. If the claim does not match an explicitly
   requested issue, release it and stop.
3. Read the full issue and search open PRs for it before editing. Existing PR ->
   release blocked with that PR as evidence; never duplicate work.
4. Use an isolated worktree/branch only when the invocation explicitly authorizes
   it; otherwise preserve the current checkout per `AGENTS.md`. Resume existing
   PRs in their existing checkout.
5. Implement only the issue contract. Batch at most six issues that share an area
   or gate family; rerun acceptance after each overlapping change.
6. Run every acceptance command plus relevant workspace tests/type-check/lint/
   deadcode/dup/format checks. Run the repository aggregate verification required
   by `AGENTS.md` before shipping. Never weaken a gate.
7. Open a PR whose first body line is `Agent-Backlog-PR: true`, with one
   `Fixes #<issue>` line per completed issue and explicit validation evidence.
8. Wait for bounded CI checks, then run
   `node scripts/agents/backlog-pr-merge-check.mjs <pr>` immediately before any
   merge. Only exit 0 with `decision: allow` authorizes squash merge with the
   returned head SHA. Never use `--admin`.
9. Comment on `triage-log` with fixed/merged/released/blocked evidence. Leave no
   orphan `status:working` claim without an owned open PR.

## Internal playbook routing

Do not duplicate troubleshooting instructions here. When the issue or failing
acceptance check matches one of these cases, read the existing specialist skill
as an internal playbook and return here for completion:

| Failure | Internal playbook |
| --- | --- |
| unclear pnpm/turbo CI mapping | `monorepo-ci-debugging` |
| format/lint loop | `monorepo-lint-format-loop` |
| coverage gate | `monorepo-coverage-gate` |
| duplication gate | `monorepo-dup-check` |
| build/module/import failure | `monorepo-build-import-errors` |
| analytics-engine CI | `analytics-engine-ci-debugging` |
| app Playwright CI | `app-playwright-ci-debugging` |
| desktop CI | `desktop-ci-debugging` |
| env drift | `env-drift-ci-debugging` |

These are implementation knowledge, not additional user-facing workflows. Use the
model's normal engineering judgement for simple failures without a matching
playbook.

## Release outcomes

- `released` — not worked or unsuitable timing; include a reason.
- `blocked` — requires judgement, secrets/live e2e, stale/ambiguous acceptance,
  protected files, or an existing PR.
- `already-fixed` — acceptance passes on main; provide a main commit SHA or merged
  PR number so the server can verify it before closing.

New work closes only through merged PR `Fixes` references.

## Worker boundary

Allowed work is low-risk repository implementation with deterministic local
verification. Format/lint/type/test/coverage/dup/build/import failures are normal
worker work when the fix remains inside the issue contract.

Never create backlog items, decide product direction, change production state,
push main, force-push, bypass hooks, manually change backlog labels, or use
production secrets for verification.

Never edit workflows/actions, hooks, environment manifests, migrations, auth or
secret boundaries, wallet/investment/portfolio semantics, alert thresholds,
verification/CI scripts, agent/harness config, `.agents`, `.opencode`, `.claude`,
or root package/lock/workspace/Turbo configuration. If an issue requires one of
these, release `blocked` for strong-model/operator triage.

Stop at `claimed=false`, six issues, two consecutive blocked items, or 80% of the
harness goal budget. Release unfinished claims honestly before stopping.

---
name: agent-backlog-worker
description: >-
  Use when asked to consume bounded GitHub agent-backlog work through
  zap-pilot-ops. Covers claim/release, isolated fixes, local gates, reviewed PRs
  and deterministic limited auto-merge across Claude Code, OpenCode and Codex.
---

# Agent backlog worker

GitHub labels are the only claim state. Use the MCP claim/release protocol;
never hand-edit labels or close issues. The user chooses the harness and model.
`operator.actions[].allowed:false` describes the server runner, not your ability
to open a reviewed PR under this skill.

## Run order

0. Sweep your open PRs using `gh pr list --state open --author
i-xtsu-sixyou-ken-mei --search "Agent-Backlog-PR: true in:body"`.
   Run merge-check below on each. Merge allowed PRs; skip pending checks.
   Repair quick-gates/code-quality/tests failures in their existing worktree
   within this run's six-issue budget. Report e2e/coverage failures for a human.
1. Preflight: find exactly one open triage-log issue and verify MCP reachability.
   Read root/scoped AGENTS.md. Verify `gh api user --jq .login` is
   `i-xtsu-sixyou-ken-mei`, and git email is
   `i-xtsu-sixyou-ken-mei@users.noreply.github.com`. Stop on mismatch.
   Accept `area:<slug>` or `#<issue>`; pass area as `areas` to claim.
2. `ops_backlog_claim { agentId: "<harness>-backlog-worker@<hostname>", areas? }`.
   claimed=false stops. For #n, compare the returned number; release a mismatch
   as released and stop, because claim selects oldest eligible work.
   Read the full issue and search open PR bodies for its number before coding.
   Existing PR → release blocked naming that PR; never duplicate it.
3. Isolate only when the user's invocation explicitly authorizes a new
   backlog worktree/branch; otherwise preserve the current checkout per root
   AGENTS.md and report that isolation authorization is needed before coding.
   With authorization, fetch origin and create `.claude/worktrees/backlog-YYYYMMDD-n`
   from origin/main with branch `backlog/YYYYMMDD-slug`. Never change the user's
   primary checkout. Install using `HUSKY=0 pnpm install --frozen-lockfile --offline`
   (missing cache: `--prefer-offline`), then build internal packages through Turbo.
   Never bypass hooks on commit/push. Resume an existing PR in its own checkout.
4. Fix within the issue's scope, using the relevant repo CI skill. Batch at most
   six issues sharing area/gate family. Read each before changing it; overlapping
   fixes are sequential and acceptance is rerun after each. Do not run production
   secret-backed acceptance checks. Ambiguous or unavailable verification → blocked.
5. Run every local acceptance command and each touched workspace's relevant test,
   type-check, lint, deadcode, dup:check and format:check via Turbo. Before shipping,
   run `bash scripts/verify-jobs.sh format repo contracts` and
   `bash scripts/verify-jobs.sh type-check lint`. Never weaken a gate.
6. Ship with one `Fixes #n` line per issue. PR body first line must be
   `Agent-Backlog-PR: true`, followed by Intent/Scope, Validation (one PASS per
   gate), Validation gaps, Known unrelated failures. Recheck GitHub identity and
   root AGENTS.md push transport rules. Use the authorized HTTPS push URL; a
   failed push is a stop, never an excuse to switch identities or bypass hooks.
7. Wait for your PR CI with bounded checks (at most 20 polls, roughly 120 seconds
   apart; split waits to preserve user updates). Re-run merge-check immediately
   before merging. Never infer permission merely from green checks.
8. Comment on triage-log with Coverage, fixed/opened/merged/released/blocked,
   evidence URLs and deny reasons. Re-read the result. Ensure no issue you claimed
   retains status:working unless it has your open PR. Remove only your clean,
   pushed worktree; preserve unpushed changes for recovery and name their path.

## Release outcomes

- released: not worked or unsuitable timing; include a reason.
- blocked: requires judgement, secrets, live e2e, stale acceptance or existing PR.
- already-fixed: run the issue's acceptance on main and provide `evidence` with
  a main commit SHA or merged PR number. The server verifies ancestry/merge before
  closing. A branch head is not a squash commit; failures remain claimed for retry.

New work closes only through a merged PR's Fixes reference. Never call
`gh issue close`. Do not remove a working label while your open PR owns the work.

## Merge policy

The sole authority is:

```bash
node scripts/agents/backlog-pr-merge-check.mjs <pr>
```

Only exit 0 with decision allow permits:
`gh pr merge <pr> --squash --delete-branch --match-head-commit <headSha>`.
Use the returned headSha. Exit 1, exit 2 or malformed output means deny; preserve
PR and report reasons. Never use --admin. The script requires all seven CI
checks, eligible closing issues, bounded scope, clean mergeability and no protected
paths or threshold removals. Human-reviewed exceptions are outside this skill.

## Stops and hard rules

Stop at claimed=false, six issues, two consecutive blocked items, or 80% of the
harness goal budget. Release unfinished claims with honest reasons before stopping.
The optional OpenCode `/backlog-worker` wrapper sets its budget; the skill itself
uses no harness-only tools.

Never create backlog items, push main, force-push, bypass hooks, manually change
labels, merge a denied PR, or use production secrets for verification. Never edit
.github/workflows, .github/actions, .husky, config/env, environment manifests,
supabase/migrations, scripts/lint, verification/CI scripts, scripts/agents,
.opencode, .agents, .claude, MCP/harness config, root package/lock/workspace/Turbo
config. Issue scope does not override these exclusions. Never weaken tests,
coverage, duplication, types, lint, auth or architectural boundaries.

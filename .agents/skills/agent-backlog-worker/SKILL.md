---
name: agent-backlog-worker
description: >-
  Use when a low-budget/background agent has been asked to pick up and fix a
  bounded item from the GitHub Issues-backed agent backlog through the
  zap-pilot-ops MCP (ops_backlog / ops_backlog_claim / ops_backlog_release /
  ops_backlog_renew). Covers connecting to the remote MCP with no repository
  secrets, the one-claim-at-a-time lifecycle, which gates are safe to run
  without environment access, and the rules that keep two agents from ever
  duplicating the same PR.
---

# Agent backlog worker

You have no repository secrets, no Infisical access, and cannot render
`apps/app`. GitHub Issues is the work-item source of truth; a Supabase-backed
lease (surfaced through `zap-pilot-ops`) is the only thing that prevents two
agents from claiming the same issue. Follow this loop exactly — it is the
whole safety mechanism.

## Connect

You reach the MCP over its remote HTTP transport, not the repository-local
stdio launcher (that one needs Infisical). Configure your MCP client with:

```json
{
  "mcpServers": {
    "zap-pilot-ops": {
      "url": "https://ops.zap-pilot.org/api/mcp",
      "headers": { "Authorization": "Bearer <OPS_MCP_TOKEN>" }
    }
  }
}
```

`OPS_MCP_TOKEN` is the one credential you are given; it only authenticates you
to this endpoint and is not a GitHub token. **If the MCP does not connect,
stop and report that — do not fall back to picking a task by browsing GitHub
yourself.** Choosing your own task defeats the one thing this system exists
to guarantee: that no two agents work the same issue.

## The loop

1. Call `ops_backlog`. If you already hold a live lease (check `items[].claim.agentId`
   against your own stable `agentId`), resume that issue or release it first —
   never claim a second one while you hold one.
2. Call `ops_backlog_claim` with a stable `agentId` (the same value every time
   you run, so a crash-and-restart reuses your own lease instead of hoarding a
   second issue) and a `leaseSeconds` sized to the task's `effort:*` label:
   xs → 3600, s → 7200, m → 14400 (the maximum). If `claimed: false`, there is
   no eligible work right now — stop, do not invent a task.
3. Before writing any code, run `gh pr list --state open --search "#<issue> in:body"`.
   If a PR already references the issue, call `ops_backlog_release` with
   `released` and stop — someone already finished or is finishing this.
4. Read the full issue with `gh issue view <issue>`. Work strictly inside its
   *Relevant files / area* and *Acceptance criteria*. Anything outside that
   scope is not yours to fix — release `blocked` with a one-line reason
   instead of expanding the change.
5. Before a step that will not finish quickly (a CI run, a slow test suite),
   call `ops_backlog_renew` first. A lease that expires mid-task can be
   re-claimed by another agent while you are still working it.
6. Before pushing, call `ops_backlog` again and confirm your `claimId` is
   still the active lease on the issue. If it is gone (expired and reclaimed),
   stop — do not push; someone else may already be on it.
7. Open the PR with exactly one `Fixes #<issue>` in the body. **Do not call
   `ops_backlog_release` after opening the PR** — releasing would return the
   issue to the ready pool while your PR is still open. Let the lease expire
   naturally; GitHub closing the issue on merge is the only completion signal
   this system trusts.
8. If you get stuck — genuinely blocked, not merely "this is hard" — call
   `ops_backlog_release` with `outcome: 'blocked'` and a specific reason. Do
   not silently abandon a claimed issue.

## Hard rules

- Never touch `.github/workflows/**`, coverage/duplication thresholds,
  `config/env.manifest.mjs` or `config/env/*.env`, or `supabase/migrations/**`
  unless the issue's *Relevant files* explicitly names one of them.
- Never skip, delete, or weaken a test, type, or lint rule to make a gate
  pass. A gate you cannot make pass with the tools you have is a `blocked`
  release, not a workaround.
- You cannot run `e2e` or `analytics` gates (no Privy env, no Postgres, no
  Fly web export). Never claim in a PR that they pass. If an issue's
  acceptance criteria require one of them, it should not have been labeled
  `agent:weak` — release it `blocked` and say so.
- You never call `ops_backlog_create`. Preserving new bounded follow-up work
  is a strong-agent action; you only consume the backlog.
- You never close issues, edit labels, or delete `status:working` with `gh`
  directly. The MCP's release/claim mirror those labels for you; touching
  them by hand can desynchronize the visible label from the real lease.
- One claimed issue, one PR. Do not batch multiple issues into one change.

## Gates you can run with no environment

| Gate | Command | Notes |
| --- | --- | --- |
| format (read-only) | `pnpm turbo run format:check --filter=<workspace>` | `pnpm format check` **writes files** — never use it to verify |
| lint | `pnpm turbo run lint --filter=<workspace>` | |
| type-check | `pnpm turbo run type-check --filter=<workspace>` | |
| test | `pnpm turbo run test --filter=<workspace>` | |
| deadcode | `pnpm turbo run deadcode --filter=<workspace>` | |
| duplication | `node scripts/lint/run-jscpd.mjs src` (from inside the workspace directory) | not part of the turbo task graph; run it standalone, and never in the same breath as `format:check` (a race between the two produces a false-red report) |
| repo-wide config drift | `pnpm lint repo` | |
| analytics-engine contract parity | `apps/analytics-engine`'s `check_pydantic_parity.py` | `pnpm contracts check` overwrites a committed zod snapshot — do not run it to verify |

Never run `pnpm verify *`, `e2e`, or anything under `apps/analytics-engine`
that needs a live Postgres — none of it is reachable without secrets you do
not have.

## Known traps

- The pre-commit hook runs `eslint --fix` on staged files. If it changes
  anything, re-run the full gate set above before pushing — an autofix can
  silently flip a passing gate red (most commonly `dup:check`, by pushing an
  existing near-duplicate over the clone threshold).
- `pnpm format check`/`bash scripts/format.sh check` **write** to the working
  tree before diffing; only `pnpm turbo run format:check` (prettier
  `--check`) is safe to run for verification without committing first.

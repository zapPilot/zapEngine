---
name: agent-backlog-worker
description: >-
  Use when a low-budget/background agent has been asked to pick up and fix a
  bounded item from the GitHub Issues-backed agent backlog through the
  zap-pilot-ops MCP (ops_backlog / ops_backlog_claim / ops_backlog_release).
  Covers the simple GitHub-label lifecycle and the rules that keep background
  work bounded.
---

# Agent backlog worker

GitHub Issues is the work-item source of truth. `status:working` is the only
claim state; there is no database lease or renewal protocol.

## Connect

Remote/background agents reach the MCP over its HTTP transport:

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

Repository-local agents may use the repo's configured stdio MCP instead.

## The loop

1. Call `ops_backlog_claim` with a stable `agentId` and, optionally, `areas`.
   The MCP picks the oldest ready issue and adds `status:working`. If
   `claimed: false`, stop; do not invent work.
2. Before writing code, run
   `gh pr list --state open --search "#<issue> in:body"`. If a PR already
   references the issue, call `ops_backlog_release` with `released` and stop.
3. Read the full issue with `gh issue view <issue>`. Work strictly inside its
   Relevant files / area and Acceptance criteria. If the task needs stronger
   judgement or capabilities, release it as `blocked` with a specific reason.
4. Open exactly one PR for the issue with exactly one `Fixes #<issue>` in the
   body. Do not release after opening the PR; the `status:working` label stays
   until the issue closes on merge.

This deliberately accepts a tiny race: two agents that claim at nearly the
same instant could both observe the same ready issue before GitHub applies the
label. The open-PR check above is the practical duplicate-work guard for the
small number of background agents this repository runs.

## Hard rules

- Never call `ops_backlog_create`. Strong agents preserve new bounded follow-up
  work; background agents only consume it.
- Never close backlog issues manually. `Fixes #<issue>` on the implementation
  PR is the completion path.
- Never edit `status:working` or `blocked` with `gh`; use the MCP so the same
  bounded checks apply.
- One claimed issue, one PR. Do not batch unrelated backlog items.
- Never touch `.github/workflows/**`, coverage/duplication thresholds,
  `config/env.manifest.mjs` or `config/env/*.env`, or `supabase/migrations/**`
  unless the issue's Relevant files explicitly names one of them.
- Never skip, delete, or weaken a test, type, or lint rule to make a gate pass.
- You cannot run `e2e` or analytics gates that require unavailable secrets or
  live infrastructure. If acceptance criteria require them, release `blocked`.

## Gates you can run with no environment

| Gate | Command |
| --- | --- |
| format | `pnpm turbo run format:check --filter=<workspace>` |
| lint | `pnpm turbo run lint --filter=<workspace>` |
| type-check | `pnpm turbo run type-check --filter=<workspace>` |
| test | `pnpm turbo run test --filter=<workspace>` |
| deadcode | `pnpm turbo run deadcode --filter=<workspace>` |
| duplication | `node scripts/lint/run-jscpd.mjs src` from the workspace |
| repo config drift | `pnpm lint repo` |

Do not run commands that need production secrets merely to verify a bounded
background change.

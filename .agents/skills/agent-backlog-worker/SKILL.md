---
name: agent-backlog-worker
description: >-
  Use when a low-budget/background agent has been asked to pick up and fix
  bounded items from the GitHub Issues-backed agent backlog through the
  zap-pilot-ops MCP (ops_backlog / ops_backlog_release). Covers how backlog work
  is picked, batched, and closed, and the rules that keep background work
  bounded.
---

# Agent backlog worker

GitHub Issues is the work-item source of truth. There is no claim, lease, or
label protocol to observe: pick the work, fix it, and let `Fixes #<issue>` on
the merged PR close it.

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

If the MCP is unreachable, stop and report it.

## The loop

1. Call `ops_backlog` to list the ready issues.
2. Pick a batch. Any size. Prefer issues that share an area or a gate family —
   they read the same files and verify with the same commands, so one context
   covers all of them.
3. Read every issue you picked in full with `gh issue view <issue>` before
   writing code. Work strictly inside each issue's Relevant files / area and
   Acceptance criteria. If one of them needs stronger judgement or capabilities
   than you have, drop it from the batch and release it as `blocked` with a
   specific reason.
4. Open a PR with one `Fixes #<issue>` line per issue it closes. A PR may close
   as many issues as it actually fixes.

Batching is the point, but it is not free. When two issues in the batch touch
the same file, sequence them and re-run the gate between steps: the second
issue's findings are whatever the gate reports _after_ the first issue landed,
not what its description says. An issue body is a snapshot from when it was
filed — a hint count, a warning count, or a line number in it can already be
stale. Trust the gate output, and say so in the PR when the two disagree.

## Hard rules

- Never call `ops_backlog_create`. Strong agents preserve new bounded follow-up
  work; background agents only consume it.
- Never close backlog issues manually. `Fixes #<issue>` on the implementation
  PR is the completion path.
- Never hand-edit backlog labels with `gh`; use `ops_backlog_release` so the
  same bounded checks apply.
- Never touch `.github/workflows/**`, coverage/duplication thresholds,
  `config/env.manifest.mjs` or `config/env/*.env`, or `supabase/migrations/**`
  unless the issue's Relevant files explicitly names one of them.
- Never skip, delete, or weaken a test, type, or lint rule to make a gate pass.
- You cannot run `e2e` or analytics gates that require unavailable secrets or
  live infrastructure. If acceptance criteria require them, release `blocked`.

## Gates you can run with no environment

| Gate              | Command                                                  |
| ----------------- | -------------------------------------------------------- |
| format            | `pnpm turbo run format:check --filter=<workspace>`       |
| lint              | `pnpm turbo run lint --filter=<workspace>`               |
| type-check        | `pnpm turbo run type-check --filter=<workspace>`         |
| test              | `pnpm turbo run test --filter=<workspace>`               |
| deadcode          | `pnpm turbo run deadcode --filter=<workspace>`           |
| duplication       | `node scripts/lint/run-jscpd.mjs src` from the workspace |
| repo config drift | `pnpm lint repo`                                         |

Run the gate for every workspace a batch touches, not only the ones named in
the issues: a change to a shared config (`packages/knip-config`, `eslint-config`)
reaches every workspace that consumes it.

Do not run commands that need production secrets merely to verify a bounded
background change.

Repo traps that survive this simplification:

- `pnpm format check` and `scripts/format.sh` rewrite files; verify formatting
  with `format:check` only.
- `pnpm contracts check` overwrites the zod snapshot; do not run it just to
  "verify" a bounded change.
- The pre-commit hook runs `eslint --fix`, which can touch files outside the
  diff; re-run the full gate set afterwards (it often flips `dup:check` red).
- `eslint --fix` and `prettier` disagree: an autofix that adds braces leaves the
  file failing `format:check`. Run `prettier --write` on the files you edited,
  then re-run `lint`, `format:check` and `dup:check`.

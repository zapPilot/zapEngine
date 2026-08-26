---
name: ongoing-pr-scope-hygiene
description: >-
  Use when continuing a long-lived ZapEngine automation PR or branch. Preserves
  the user's current branch and worktree while keeping the PR description honest.
---

# Ongoing PR scope hygiene

Follow the repository root working-tree and history rules.

- Correct a materially inaccurate PR description once before merge so it
  describes the final scope.
- A large, mixed, stale, dirty, or unusually named branch is not by itself a
  reason to switch, split, or stop.

## Stop only for real boundaries

Ask the user before continuing only when the next action would:

- expose secrets or materially alter an authorization/security boundary;
- perform an irreversible or destructive migration;

All other stop conditions and preservation rules come from root `AGENTS.md`.

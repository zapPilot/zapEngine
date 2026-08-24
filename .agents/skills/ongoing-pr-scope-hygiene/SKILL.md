---
name: ongoing-pr-scope-hygiene
description: >-
  Use when continuing a long-lived ZapEngine automation PR or branch. Preserves
  the user's current branch and worktree while keeping the PR description honest.
---

# Ongoing PR scope hygiene

## Primary rule

The checked-out branch and worktree are the user's chosen integration unit. Continue
working there. Do not create or switch branches or worktrees, move commits, rebuild
the work on `origin/main`, or open additional PRs unless the user explicitly asks.

Existing changes belong to the user. Preserve them and adapt new work around them.

## Efficient continuation

1. Read the current diff sufficiently to avoid overwriting existing work.
2. Implement the requested outcome on the current branch.
3. Keep directly discovered fixes in the same branch and PR. Tests, CI fixes,
   documentation, migrations, generated files, snapshots, lockfiles, dependency
   updates, and formatter/lint output are valid companion changes.
4. If the PR description is materially inaccurate, update it once before merge to
   summarize the final result. Do not repeatedly police file categories while coding.
5. Run the appropriate final gate once and merge only when required checks pass.

## Stop only for real boundaries

Ask the user before continuing only when the next action would:

- overwrite or discard existing work;
- rewrite history or force-push;
- expose secrets or materially alter an authorization/security boundary;
- perform an irreversible or destructive migration;
- introduce a semantic behavior change clearly unrelated to the requested outcome;
- require leaving the current branch or worktree.

A large, mixed, stale, or unusually named branch is not by itself a reason to switch,
split, or stop. Report the final scope accurately and keep moving.

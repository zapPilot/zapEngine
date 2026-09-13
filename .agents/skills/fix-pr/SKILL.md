---
name: fix-pr
description: Review and repair a specified PR implementation against its stated scope.
argument-hint: '<pr-url>'
---

Use the existing checkout for the PR and preserve the user's branch and worktree.
Create or switch a branch/worktree only when explicitly requested. Review the PR
description and relevant discussion against the implementation, fix concrete
in-scope issues and invalid tests, and verify under root `AGENTS.md`. Address
related CI, formatting, and lint failures; report unrelated failures separately.

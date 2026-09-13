---
description: 'Weak-model execution: consume bounded backlog work, verify it and ship reviewed PRs'
---

Call `set_goal` with maxTurns 60, maxDurationMs 7200000, maxTokens 600000.
If `set_goal` is unavailable, continue without a budget and say so in
`[goal:evidence]`.
Read and strictly follow `.agents/skills/worker/SKILL.md`.
Pass `$ARGUMENTS` unchanged. Do not discover or create new backlog work.
Invoking `/worker` itself explicitly authorizes creation of one isolated
`backlog/*` worktree/branch after a successful claim; no extra authorization
argument is required. `claimed=false` stops before any worktree is created.
Finish with `[goal:evidence]` and one truthful `[goal:complete]` or
`[goal:blocked]` result including open PRs and released claims.

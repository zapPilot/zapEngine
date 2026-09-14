---
description: 'Weak-model execution: consume bounded backlog work, verify it and ship reviewed PRs'
---

Call `set_goal` with maxTurns 60, maxDurationMs 7200000, maxTokens 600000.
If `set_goal` is unavailable, continue without a budget and say so in
`[goal:evidence]`.
Read and strictly follow `.agents/skills/worker/SKILL.md`.
Invoking `/worker` explicitly authorizes creation of exactly one isolated
`backlog/*` worktree/branch after a successful backlog claim. Pass `$ARGUMENTS`
unchanged as an optional `area:<slug>` or `#<issue>` selector; callers do not need
to restate worktree authorization. Do not discover or create new backlog work.
Finish with `[goal:evidence]` and one truthful `[goal:complete]` or
`[goal:blocked]` result including open PRs and released claims.

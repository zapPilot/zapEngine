---
description: 'Weak-model execution: consume bounded backlog work, verify it and ship reviewed PRs'
---

Call `set_goal` with maxTurns 60, maxDurationMs 7200000, maxTokens 600000.
Read and strictly follow `.agents/skills/worker/SKILL.md`.
Pass `$ARGUMENTS` unchanged. Do not discover or create new backlog work.
Finish with `[goal:evidence]` and one truthful `[goal:complete]` or
`[goal:blocked]` result including open PRs and released claims.

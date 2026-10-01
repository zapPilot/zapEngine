---
description: 'Weak-model execution: consume bounded backlog work, verify it and ship reviewed PRs'
---

Call `set_goal` with top-level arguments (not packed into `constraints`):

```json
{
  "objective": "Consume ready backlog items per .agents/skills/worker/SKILL.md until a stop condition",
  "maxTurns": 60,
  "maxDurationMs": 7200000,
  "maxTokens": 600000
}
```

On an argument error, correct the arguments and retry once. Only if the tool does
not exist, continue without a budget and report unavailable in `[goal:evidence]`;
a call error is not tool unavailability.
Read and strictly follow `.agents/skills/worker/SKILL.md`.
Invoking `/worker` authorizes one isolated `backlog/*` worktree/branch at a time,
each only after `claimed=true`, and at most one PR per run. Releasing an item
without a commit frees that slot after cleanup per the skill. Pass `$ARGUMENTS`
unchanged as an optional `area:<slug>` or `#<issue>` selector; callers do not need
to restate worktree authorization. Do not discover or create new backlog work.
Finish with `[goal:evidence]` and one truthful `[goal:complete]` or
`[goal:blocked]` result including open PRs and released claims.

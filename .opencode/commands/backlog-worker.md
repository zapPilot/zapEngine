---
description: 'Consume bounded backlog work with a goal budget and deterministic merge checks'
---

Call `set_goal` with maxTurns 60, maxDurationMs 7200000, maxTokens 600000.
Read and strictly follow `.agents/skills/agent-backlog-worker/SKILL.md`.
Pass `$ARGUMENTS` unchanged. Wait for owned PR CI within that skill's limits.
Do not select an agent or model. Finish with `[goal:evidence]` and one truthful
`[goal:complete]` or `[goal:blocked]` result, including open PRs and released claims.

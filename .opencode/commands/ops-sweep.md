---
description: 'Unattended ops sweep: find and fix everything except feature work in one PR until the budget runs out'
---

Call `set_goal` with top-level arguments (not packed into `constraints`):

```json
{
  "objective": "Run the ops sweep in .agents/skills/ops-sweep/SKILL.md until the budget runs out",
  "maxTurns": 5000,
  "maxDurationMs": 86400000,
  "maxTokens": 200000000
}
```

If `set_goal` is unavailable or rejects the call twice, continue without it.
Read and follow `.agents/skills/ops-sweep/SKILL.md`. Pass `$ARGUMENTS` unchanged
as optional focus input. Never emit `[goal:complete]`; the sweep ends when the
budget does. Emit `[goal:blocked]` only when no tool works at all.

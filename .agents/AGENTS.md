# Agent skill authoring guidelines

This directory stores reusable agent instructions for recurring ZapEngine work.
Keep it small: skills are operational guardrails, not long-form documentation.

## Default rule

Do **not** create or expand a skill unless it prevents a repeated agent failure.
Most task-specific knowledge belongs in the code, tests, README, CLAUDE.md, or the
PR description instead.

A good skill captures:

- a recurring trigger the agent can recognize,
- the exact file/log/command that contains the signal,
- the smallest safe workflow to fix or verify it,
- the rationalizations that previously led agents astray.

It should not capture:

- a full investigation transcript,
- general engineering advice,
- project history that is not required for the next fix,
- one-off task context,
- pasted external documentation.

## When a scheduled task may add a skill

Scheduled tasks may propose a new skill only when all are true:

1. The same class of failure has appeared more than once.
2. The failure mode is likely to recur for future agents.
3. The fix depends on repo-specific traps, commands, or file locations.
4. The skill can be written as a compact operational checklist.

If any condition fails, do not add a skill. Put the finding in the PR body or a
short code comment near the relevant script instead.

## Size budget

Hard limits for every `.agents/skills/*/SKILL.md`:

- Target: 60-120 lines.
- Maximum: 180 lines unless there is a strong reason.
- Frontmatter description: 1 focused paragraph, under 8 wrapped lines.
- Body: prefer headings, short bullets, and command blocks.
- No copied docs. Summarize only the repo-specific part.

If a skill is approaching the limit, split rare details into one direct reference
file next to `SKILL.md`, for example `REFERENCE.md` or `EXAMPLES.md`. Avoid nested
reference chains.

## Skill structure

Use this shape by default:

```markdown
---
name: short-gerund-or-domain-name
description: >-
  Use when [specific trigger]. Covers [scope]. Symptoms: [recognizable failure
  phrases or logs]. Does not cover [nearby scope] if useful.
---

# Human-readable title

## Where the signal already is
[Point to the exact log/file/CI job. Do not re-discover from scratch.]

## Core principle
[One strong rule that prevents the previous bad behavior.]

## Fix workflow
[Small ordered steps or a compact table by failure case.]

## Rationalizations — STOP
[Short table of tempting but wrong shortcuts.]

## Verification
[The exact commands or CI checks that must pass.]
```

## Frontmatter rules

- `name` uses lowercase letters, numbers, and hyphens only.
- Prefer specific names over generic ones: `monorepo-dup-check`, not `ci-helper`.
- Description is for discovery. Include exact triggers, commands, CI job names,
  packages, and failure phrases.
- Write descriptions in third person / imperative-neutral style. Do not write
  "I can" or "you can".

## Content rules

- Assume the model already knows general programming concepts.
- Prefer repo-specific commands and paths over explanations.
- Use one term consistently across the skill.
- Include examples only when they change behavior.
- Keep references one level deep from `SKILL.md`.
- Use forward slashes in paths.
- Do not include time-sensitive statements unless they are historical context in
  an explicit "Old patterns" or "Known incident" note.
- Do not tell agents to weaken CI gates, lower coverage floors, raise thresholds,
  hand-edit generated lockfiles, or silence type/lint errors without fixing the
  underlying issue.

## Validation loop

Before opening a PR that adds or edits a skill, check:

- Does this skill remove repeated ambiguity for future agents?
- Can the trigger be recognized from the user's request, CI output, or repo logs?
- Is the first action a precise file/log/command to inspect?
- Is the safe fix path shorter than the anti-pattern list?
- Could any paragraph be replaced by a command, path, or link?
- Would this still be useful six months from now?

If the answer is weak, shorten it or do not create the skill.

## Scheduled-task guardrail

Scheduled tasks must not grow skills by appending every lesson learned. On each
run, they should make the smallest durable update:

1. Fix code/tests/config first.
2. Update an existing skill only if the run exposed a missing recurring trap.
3. Add a new skill only if the criteria above pass.
4. Keep the PR diff reviewable: one behavior change plus one small doc update at
   most.

When in doubt, leave a PR note instead of expanding `.agents/skills`.

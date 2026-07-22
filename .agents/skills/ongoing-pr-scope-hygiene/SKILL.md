---
name: ongoing-pr-scope-hygiene
description: >-
  Use when continuing ZapEngine automation PRs whose title, label, or branch marks
  them as ongoing work, especially `[test-qa-hourly]`, `[skills-daily]`,
  `test-qa/ongoing-*`, or `docs/agent-skills-ongoing-*`. Prevents the PR body and
  allowed scope from drifting away from the actual branch diff.
---

# Ongoing PR scope hygiene

## Where the signal already is

Before adding another commit, compare all three:

1. the PR title/body and declared scope;
2. the complete `base...head` changed-file list;
3. the task's allowed and forbidden changes.

Use the GitHub PR diff as source of truth. In a checkout, also run:

```bash
git fetch origin main
git diff --name-status origin/main...HEAD
git log --oneline origin/main..HEAD
```

## Core principle

**An ongoing branch is reusable only while its complete diff still represents one
coherent task. The latest commit message is not the PR scope.**

ZapEngine automation branches live across runs, so unrelated fixes can accumulate
silently. Do not call a PR `test-only` or `docs-only` unless every changed file
matches that claim.

## Continuation workflow

1. Read the full PR diff before editing, not only the latest commit.
2. Classify every changed file against the task's allowed scope.
3. If all files remain coherent, continue the branch and update the PR body to
   describe the complete current diff.
4. If a newly discovered CI fix is directly required by the existing change, add
   only the minimal fix and update the scope/validation sections immediately.
5. If the fix belongs to another workflow—security infrastructure in a test-only
   PR, agent docs in a QA PR, or unrelated product code—stop extending the branch.
6. Do not merge while the PR body understates the diff or required PR-head checks
   are failing.

## ZapEngine scope boundaries

- `[test-qa-hourly]`: tests, fixtures, minimal test utilities, and only the minimal
  implementation fix directly exposed by those tests.
- `[skills-daily]`: `.agents/skills`, `.agents/AGENTS.md`, CLAUDE/README/runbooks;
  no implementation, tests, dependency, lockfile, or CI-script changes.
- Security/audit command changes are not automatically test QA work. Treat changes
  to `scripts/security.sh`, lockfiles, or dependency constraints as separate scope
  unless they are the active task's explicit CI blocker and the PR body says so.

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "The newest commit is test-only." | The PR is reviewed and merged as the complete `base...head` diff. |
| "CI needed this unrelated script fix." | Update the declared scope only when it is directly required; otherwise stop and route it separately. |
| "The PR body was accurate when opened." | Long-lived automation PRs must refresh the body after every scope-changing commit. |
| "All checks passed, so scope does not matter." | Green CI does not make a misleading or mixed-purpose PR safe. |

## Verification before merge

- PR title/body describe every changed area.
- Complete changed-file list fits the active task's allowed scope.
- No forbidden files, secrets, blanket ignores, or gate reductions are present.
- Required checks are green on the final PR head.
- If the branch is stale, conflicted, oversized, or mixed-purpose, stop for review
  instead of adding another commit or opening an overlapping PR.

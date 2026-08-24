---
name: monorepo-lint-format-loop
description: >-
  Use when formatter, lint-staged, or generated-file output changes an edit or a
  format/lint failure repeats. Favors automatic repair over manual diff minimization.
---

# Monorepo lint / format rewrite loop

## Fast path

Formatting and deterministic generated output are always allowed, including across
the repository. Do not spend time minimizing a mechanical diff or restoring files
that the canonical formatter changed.

1. Run the relevant autofixer once. Repository-wide formatting is acceptable when
   it is simpler than identifying individual files.
2. Accept and stage its complete mechanical output.
3. Re-run the exact failing check once.
4. If it passes, continue. Do not perform additional per-file analysis.

When the agent has no executable repository environment, leave the code unformatted,
state that formatting was not run, and let the next environment-enabled agent or CI
apply the canonical output.

## Diagnose only after the fast path fails

Read `.husky/pre-commit` and `.ai-verify/result.json` only when the same failure
persists after autofix. Determine whether the owner is:

- Prettier/ESLint/Ruff: run its write/fix mode and keep the result.
- `snapshot-sync`: edit the source fixture and regenerate the mirror.
- `lint repo` or `lint dead-env`: fix the reported structural issue.
- a generated artifact: update its source and run the owning generator.

Do not repeat a rejected manual edit, hand-edit generated mirrors, weaken a gate, or
use `--no-verify` to hide a real failure. Do not switch branches or worktrees to solve
a formatting problem.

Finish with one appropriate aggregate verification; do not rerun equivalent format,
workspace, and repository gates separately.

---
name: monorepo-lint-format-loop
description: >-
  Use when a staged edit appears to be rewritten, the same format/lint failure
  repeats after commit, or a generated file will not keep manual edits. Covers
  ZapEngine's husky + lint-staged + snapshot-sync pre-commit flow.
---

# Monorepo lint / format rewrite loop

## Core rule

Do not re-apply the same edit. First identify which deterministic pre-commit step
owns the file, then fix that step's input or conform to its canonical output.

CI checks are read-only; local pre-commit steps may rewrite and re-stage files.

## Current pre-commit order

Read `.husky/pre-commit` when behavior changes. Today it runs:

```bash
pnpm install --frozen-lockfile --prefer-offline --ignore-scripts
pnpm lint snapshot-sync --fix
git add apps/landing-page/src/data/strategy-snapshot.json
pnpm lint repo
pnpm lint dead-env
pnpm lint-staged
```

The important split:

- `snapshot-sync --fix` regenerates and re-stages the landing snapshot mirror.
- `pnpm lint repo` and `pnpm lint dead-env` fail read-only; they do not repair
  structural drift.
- `pnpm lint-staged` runs staged-file autofixers such as ESLint/Prettier and can
  change what is finally committed.

## Diagnose the owner

After a commit that seems to have reverted an edit:

```bash
git show HEAD:path/to/file
git diff -- path/to/file
```

Classify the result:

| Evidence | Owner | Fix |
| --- | --- | --- |
| whitespace/import/format shape changed | lint-staged formatter | run the formatter and keep its output |
| generated snapshot changed | snapshot-sync | edit the analytics source fixture, not the mirror |
| committed file matches your edit but check is red | read-only/non-fixable rule | fix the reported structural/code issue |
| CI reports format/lint only | CI read-only check | reproduce locally; do not blame CI for rewriting |

For local verify failures, read `.ai-verify/result.json` and the named log under
`.ai-verify/logs/` before editing again.

## Fix loop

1. Read `.husky/pre-commit` and the exact failing log.
2. Inspect `git show HEAD:path/to/file`; preserve this evidence instead of
   stashing or checking the file out.
3. If lint-staged owns the rewrite, run the workspace autofixers directly:

```bash
pnpm --filter @zapengine/<pkg> exec eslint --fix path/to/file
pnpm --filter @zapengine/<pkg> exec prettier --write path/to/file
```

4. If snapshot-sync owns the file, change its source and let the hook regenerate
   `apps/landing-page/src/data/strategy-snapshot.json`.
5. If `lint repo`, `lint dead-env`, or a non-fixable ESLint rule is red, make the
   structural/code fix manually; repeated commits cannot auto-repair it.
6. Re-run the exact failing command before committing again.

## Never do this

- Re-commit the same rejected edit hoping it will stick.
- Use `--no-verify` to bypass the deterministic owner.
- Hand-edit the generated strategy snapshot mirror.
- Change ESLint/Prettier configuration before proving the formatter is the
  failing actor.
- Destroy the evidence with `git checkout` / `stash` before comparing HEAD.

## Verification

For a formatter-owned file, rerun the relevant workspace check after autofix.
For repository drift, use the exact pre-commit checks:

```bash
pnpm lint repo
pnpm lint dead-env
```

If the problem surfaced in CI, finish through **monorepo-ci-debugging** and
confirm the latest PR head is green.

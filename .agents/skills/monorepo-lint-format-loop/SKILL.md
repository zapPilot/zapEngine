---
name: monorepo-lint-format-loop
description: >-
  Use when your code edit seems to keep getting reverted, a pre-commit hook
  keeps failing on the same file, or you keep re-applying the same fix and
  re-committing in a loop — in a repo with husky + lint-staged. Symptoms:
  "something is overwriting my changes", "the commit succeeded so the file must
  match what I wrote", reaching for `git checkout`/`stash` or `--no-verify`, a
  2nd or 3rd identical re-commit cycle on the same file.
---

# Breaking the lint / format / codegen revert loop

## Core principle — reframe it

**"My edit keeps getting reverted" is the wrong frame. The right frame is: a
deterministic process rewrites this file on commit — find which one, and edit
its INPUT.** Your edit did apply; a hook then rewrote the file. Nothing is
"flaky" and nothing is racing you.

**STOP re-committing the same fix.** Re-applying an edit a formatter will rewrite
the same way can never converge — you are fighting a deterministic tool.

## CI is read-only; the local hook is not

This is the distinction that ends the confusion:

- **CI** runs `eslint .` / `prettier --check` — **read-only**. It only *fails*;
  it never mutates a file. So "CI rewrote my file" is impossible.
- **The local pre-commit hook** (husky → `lint-staged`) runs `eslint --fix` /
  `prettier --write` — these **mutate** staged files and re-stage them. **Same
  tools, opposite behavior.** The local hook is the actor.

## Two mechanisms that produce the symptom

1. **Formatter rewrite (most common).** `lint-staged` runs `eslint --fix` +
   `prettier --write` on staged files, re-stages, and commits the
   **auto-formatted** version. If your hand-written fix differs even slightly
   from the canonical output, the commit silently captures the tool's version,
   and a check the autofixer doesn't satisfy keeps failing — looks like a revert.
2. **Codegen / drift rewrite.** The hook also runs a generator+restage step
   (here: `pnpm lint:snapshot-sync:fix` then
   `git add apps/landing-page/src/data/strategy-snapshot.json`). If the file you
   edited is a **generated artifact**, your manual edit is *correctly*
   overwritten every commit. Editing the output is futile — edit the **source
   the generator reads**.

## Diagnose — see the hook's fingerprint

Don't guess. After a commit that "reverted" you:

```bash
git show HEAD:path/to/file   # what actually got committed
git diff -- path/to/file     # working tree vs index, if it diverged again
```

Then identify the owner:

- Diff is pure whitespace / quote / import-order / rule-shape churn → **formatter**.
- File is listed in a `*:fix` + `git add` step in `.husky/pre-commit`, or is
  clearly emitted output → **codegen / drift**.
- **Committed file MATCHES what you wrote, yet the check still fails** → *no
  rewrite happened*. The actor is a **read-only check** (`pnpm lint:repo` drift,
  or a **non-auto-fixable** lint rule — `no-explicit-any`, complexity, a custom
  rule). Stop hunting for a diff; the identical re-commit can never help — fix
  the structural / code violation manually.

When unsure which actor, open `.husky/pre-commit` and read its steps top to
bottom — the set of actors (install, snapshot codegen + restage, `lint:repo`
read-only, lint-staged mutate) is hook-specific.

## Fix — by owner

- **Formatter owns it → conform, don't fight.** Run the formatter yourself
  *before* staging so the file is already canonical and the hook becomes a
  no-op:
  ```bash
  pnpm --filter @zapengine/<pkg> exec eslint --fix path/to/file
  pnpm --filter @zapengine/<pkg> exec prettier --write path/to/file
  ```
  To find a form that *survives* `eslint --fix`: run it, look at what it
  rewrote, and adopt **that** as your starting point — let the tool show you the
  canonical form rather than guessing it.
- **Codegen owns it → fix the input.** Edit the source the generator reads
  (here, the analytics-engine fixture that `snapshot-sync` copies), then let the
  hook regenerate the output.
- **Read-only check / non-fixable rule owns it → fix it manually.** `eslint
  --fix` can't resolve every rule. If the rule is non-fixable, the file commits
  as-written and the check legitimately still fails — you need a genuine code
  change, not a re-commit.

**Then confirm convergence:** re-run the exact failing check and watch it pass
**before** you re-commit. Don't re-enter the loop on faith.

## Read-only drift checks fail but never auto-fix

The other half of the loop: `pnpm lint:repo` runs `config-drift.ts` and
`scripts-drift.ts` — **no `--fix` mode**. Structural violations (tsconfig
`rootDir`/`types`, a missing `build`/`type-check` script, a wrong `dup:check`
command) only *fail*; they will not auto-correct. **Don't loop expecting
auto-fix — fix the structure manually.** (Exception: `snapshot-sync` *has*
`--fix` and the pre-commit hook runs it for you.)

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "Something is overwriting my changes." | Yes — a known hook. It's deterministic, not a phantom. Find it with `git show HEAD:path`. |
| "The commit succeeded, so the file matches what I wrote." | `lint-staged` re-stages an auto-fixed version *after* you staged. The commit holds the tool's version. |
| "lint-staged only formats; it wouldn't change my fix's meaning." | It rewrites to canonical form. If your fix isn't canonical, it's rewritten — that's the loop. |
| "Re-apply the exact same fix once more and it'll stick." | A deterministic rewrite gives the same result every time. Re-applying can't converge. |
| "I'll add `--no-verify` to force my version through." | Masks the problem, diverges from the formatter/generator, and violates the CI-is-authoritative posture. Never. |
| "Let me `git checkout`/`stash` to reset state." | Destroys the evidence (the committed version) you need to diagnose. |

## Red flags — you're in the loop

- Re-editing + re-committing the same change a 2nd or 3rd time.
- Hunting for a "ghost" file watcher / editor auto-save / daemon.
- Tweaking `eslint.config.mjs` / `.prettierrc` *before* confirming a formatter is
  even the actor.
- Reaching for `--no-verify`, `git checkout --`, or `git stash`.

**All of these mean: STOP. Run `git show HEAD:path`, identify the owner
(formatter vs codegen), then conform or fix the input.**

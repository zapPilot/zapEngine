# AGENTS.md

Read the nearest scoped `AGENTS.md` before changing code. Scoped rules may add to or override these repository-wide defaults.

## Repository guardrails

* Treat the current checkout, branch, worktree, commits, and uncommitted changes as user-owned context. Preserve them and continue the requested work where it was started.
* Do not create or switch branches or worktrees, detach `HEAD`, reset, squash, rebase, replay commits, substitute another base, move commits between worktrees, split work into additional PRs, rewrite history, or force-push unless the user explicitly asks. If the current branch cannot be published safely, explain why instead of silently changing context.
* Keep directly related fixes together, including tests, CI, documentation, migrations, generated files, snapshots, lockfiles, dependency updates, and formatter or lint autofixes. Avoid unrelated semantic behavior changes. Accept canonical formatter and generated output instead of hand-restoring mechanical diffs.
* Fix root causes. Do not weaken tests, CI gates, coverage thresholds, types, lint rules, validation, or architectural boundaries merely to make a failure disappear. For bugs, reproduce the reported failure with a test or deterministic check when practical.
* Verify real behavior before declaring success: use the narrowest relevant check during development and one appropriate aggregate gate before handoff or push. Do not treat a vacuous or no-op check as evidence. If executable verification is unavailable, report exactly what was not run.
* Do not preserve backward compatibility unless the nearest scoped instructions or an explicitly supported external contract require it. Otherwise remove obsolete paths instead of adding compatibility layers or fallbacks.

## GitHub identity

This repository must use GitHub account `i-xtsu-sixyou-ken-mei`, never `david30907d`.

Before the first commit or GitHub write in a task, confirm the active GitHub account and local git identity. For a local push, verify the SSH transport identity with:

```bash
ssh -T git@github.com
```

If SSH authenticates as `david30907d`, do not use a plain SSH `git push`. Push over HTTPS with the active `gh` credential instead:

```bash
git -c credential.helper='!gh auth git-credential' \
  push https://github.com/<owner>/<repo> <branch>
```

Never commit, push, open or edit PRs/issues, comment, or review as `david30907d`. Correct commit authorship is not sufficient if the push transport is authenticated as that account. If that account was used accidentally, report it immediately; the GitHub timeline event cannot be removed.

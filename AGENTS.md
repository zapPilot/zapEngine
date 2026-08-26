# AGENTS.md

Read the nearest scoped `AGENTS.md` before changing code. Scoped rules may add to or override these repository-wide defaults.

## Engineering principles

* Understand before editing. Read the relevant implementation, callers, tests, and nearby architecture first. Resolve uncertainty from code, runtime evidence, installed types/source, or current official documentation instead of guessing.
* Choose the simplest durable implementation that fully meets the current requirement. Avoid speculative abstractions, unnecessary configuration, feature flags, indirection, and known throwaway stopgaps. Grow capability incrementally from a working end-to-end system.
* Search before building generic functionality. Check existing repository code, installed dependencies, platform capabilities, and official APIs first. Prefer a mature dependency when it meaningfully reduces code, edge cases, or operational risk; otherwise prefer the smaller local implementation.
* Keep concerns modular and architecture boundaries explicit. Do not introduce a new paradigm into unrelated code when an established local pattern already exists.
* Fix root causes. Do not weaken tests, CI gates, coverage thresholds, types, lint rules, validation, or architectural boundaries merely to make a failure disappear.
* Do not preserve backward compatibility unless the nearest scoped instructions or an explicitly supported external contract require it. Otherwise remove obsolete paths instead of adding compatibility layers or fallbacks.

## Working tree and history

* Treat the current checkout, branch, worktree, commits, and uncommitted changes as user-owned context. Continue the requested work exactly where it was started.
* Preserve all existing changes. Related fixes discovered while implementing the requested outcome may remain in the same branch and PR, including tests, CI, documentation, migrations, generated files, snapshots, lockfiles, and formatter or lint autofixes. Avoid only unrelated semantic behavior changes.
* Do not create or switch branches or worktrees, detach `HEAD`, reset, squash, rebase, replay commits, substitute another base such as `origin/main`, move commits between worktrees, split work into additional PRs, or otherwise rewrite history unless the user explicitly asks.
* History rewriting and force-pushing always require explicit authorization. If the current branch cannot be published safely, stop and explain why instead of silently changing repository history or context.
* Mechanical formatting is allowed. Accept canonical formatter output instead of hand-restoring unrelated formatting-only changes.

## Verification

* Verification is part of implementation. During development, run the narrowest relevant check. Before handoff or push, run one appropriate aggregate gate and rely on CI for redundant full-repository coverage.
* Do not repeatedly run equivalent full checks after every small edit or commit.
* For bugs, reproduce the reported failure with a test or deterministic check when practical, then verify the fix against that reproduction.
* If no executable repository environment is available, complete the implementation without blocking on local formatting or verification. Clearly report what was not run and leave final executable verification to the next environment-enabled agent or CI.

## GitHub identity

This repository must use GitHub account `i-xtsu-sixyou-ken-mei`, never `david30907d`.

Before the first commit or GitHub write in a task:

1. Confirm the active `gh` account and local git name/email.
2. If necessary, switch to `i-xtsu-sixyou-ken-mei` and use `i-xtsu-sixyou-ken-mei@users.noreply.github.com`.
3. Before the first push, verify the SSH transport identity with:

```bash
ssh -T git@github.com
```

If SSH authenticates as `david30907d`, do not use a plain SSH `git push`. Push over HTTPS with the active `gh` credential instead:

```bash
git -c credential.helper='!gh auth git-credential' \
  push https://github.com/<owner>/<repo> <branch>
```

Never act as `david30907d` in this repository: no commits, pushes, PRs, issues, comments, or reviews. It is the user's employer account and must not appear in this project's history.

Correct commit authorship alone is insufficient: pushing through SSH authenticated as `david30907d` permanently records that account as the pusher in GitHub's PR and repository event history.

If a push has already occurred under `david30907d`, report it immediately instead of hiding it; that GitHub timeline event cannot be removed.

# AGENTS.md

Read the nearest scoped `AGENTS.md` before changing code. Scoped rules may add to or override these repository-wide defaults.

- Understand before editing. Read the relevant implementation, callers, and tests; resolve uncertainty from code and runtime evidence instead of guessing.
- Keep changes surgical. Every changed line should trace to the requested outcome; do not slip in unrelated refactors, formatting, or cleanup.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, feature flags, indirection, and "future flexibility".
- Search before building generic functionality. Check existing project dependencies and their docs/types first, then current official docs, well-maintained packages, and established GitHub implementations. Custom implementations are a last resort; when choosing one, state why the established options are unsuitable.
- Prefer a mature dependency when it removes meaningful code, edge cases, or operational risk. Do not add a dependency when a small local implementation is genuinely simpler and safer.
- Never assume an external library or API lacks or supports a capability. Verify against the installed version, current documentation, types, or source before designing around it.
- Fix root causes. Do not weaken tests, CI gates, coverage thresholds, types, lint rules, or validation to make a failure disappear.
- Verification is part of implementation. Define a checkable success condition, run the narrowest relevant tests/checks, inspect the output, and do not report completion from a plausible-looking diff alone.
- For bugs, reproduce the reported failure with a test or deterministic check when practical, then verify the fix against that reproduction.
- Grow the system in layers. Start from the smallest version that works end to end, and add each capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Do not preserve backward compatibility unless the nearest scoped instructions or an explicitly supported external contract require it. Otherwise remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
- Identity (zapEngine): This repository MUST use GitHub account `i-xtsu-sixyou-ken-mei` (`i-xtsu-sixyou-ken-mei@users.noreply.github.com`) for all commits and PRs. Before `git commit`/`git push`/`gh pr create`, verify `git config user.name` and `gh auth status` active account are `i-xtsu-sixyou-ken-mei`. Never use `david30907d` in this repo. If mismatch, run `gh auth switch --user i-xtsu-sixyou-ken-mei` and `git config user.name "i-xtsu-sixyou-ken-mei" && git config user.email "i-xtsu-sixyou-ken-mei@users.noreply.github.com"`.

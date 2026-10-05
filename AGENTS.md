# AGENTS.md

Read the nearest scoped `AGENTS.md` before changing code. Scoped rules may add to or override these repository-wide defaults.

## Repository guardrails

- Treat the current checkout, branch, worktree, commits, and uncommitted changes as user-owned context. Preserve them and continue the requested work where it was started.
- Do not create or switch branches or worktrees, detach `HEAD`, reset, squash, rebase, replay commits, substitute another base, move commits between worktrees, split work into additional PRs, rewrite history, or force-push unless the user explicitly asks. If the current branch cannot be published safely, explain why instead of silently changing context.
- Keep directly related fixes together, including tests, CI, documentation, migrations, generated files, snapshots, lockfiles, dependency updates, and formatter or lint autofixes. Avoid unrelated semantic behavior changes. Accept canonical formatter and generated output instead of hand-restoring mechanical diffs.
- Fix root causes. Do not weaken tests, CI gates, coverage thresholds, types, lint rules, validation, or architectural boundaries merely to make a failure disappear. For bugs, reproduce the reported failure with a test or deterministic check when practical.
- Verify real behavior before declaring success: use the narrowest relevant check during development and one appropriate aggregate gate before handoff or push. Do not treat a vacuous or no-op check as evidence. If executable verification is unavailable, complete the work and report exactly what was not run.
- Do not preserve backward compatibility unless the nearest scoped instructions or an explicitly supported external contract require it. Otherwise remove obsolete paths instead of adding compatibility layers or fallbacks.

## Messaging

Use [.agents/skills/persuasive-messaging/SKILL.md](.agents/skills/persuasive-messaging/SKILL.md) for marketing copy, positioning, pitch decks, promo video packaging and editorial titles.
Technical docs and functional UI strings are outside this scope.

## Fish Audio: free models only

- Fish Audio requests must use an engine whose name ends with `free`. The current required configuration is `FISH_AUDIO_ENGINE=s2.1-pro-free` in both development and production, including narration, classroom audio, brand takes and auditions.
- Never select a paid Fish model, fall back to one, or request a paid model to bypass a free-model error, quota or outage. Fail closed instead. Future upgrades may use a newer provider-supported free engine, but it must still end with `free`; update canonical env defaults, runtime defaults and tests together.
- Fish synthesis on the configured free engine is authorized without a separate payment approval. Human listening/selection gates (such as brand `--pick`) still apply. Paid music generation has its own separate policy.

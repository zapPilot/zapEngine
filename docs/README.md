# Documentation index

zapEngine's knowledge lives in several places by design — this page is the map.
**New here?** Start with [onboarding.md](./onboarding.md) for a per-role reading
order.

## Root entry points

| File                                          | What it covers                                                                                                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [README.md](../README.md)                     | Project overview, app/package architecture, setup, dev & deploy commands                                                                                                                                          |
| [CLAUDE.md](../CLAUDE.md)                     | Build order (Turbo), code style, the **architecture planes**, and the **verification hierarchy**. `AGENTS.md` / `GEMINI.md` symlink to it.                                                                        |
| [CONTRIBUTING.md](../CONTRIBUTING.md)         | Daily workflow + recipes: [add an env var](../CONTRIBUTING.md#adding-an-env-var), [add an HTTP route](../CONTRIBUTING.md#adding-an-http-route), [add an app/package](../CONTRIBUTING.md#adding-an-app-or-package) |
| [scripts/COVERAGE.md](../scripts/COVERAGE.md) | Coverage tooling + the no-regression gate                                                                                                                                                                         |
| [docs/app-layout.md](./app-layout.md)         | Standard `src/` layout for TS server apps                                                                                                                                                                         |

## Per-app docs

Each app has its own `README.md` (setup) and `CLAUDE.md` (AI-facing constraints).
Deeper design docs live under `apps/<app>/docs/`.

| App              | App docs                                                                                                                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| account-engine   | [CLAUDE.md](../apps/account-engine/CLAUDE.md) · [plan-orchestration-evolution](../apps/account-engine/docs/plan-orchestration-evolution.md)                                                                                                                                             |
| alpha-etl        | [CLAUDE.md](../apps/alpha-etl/CLAUDE.md) · [docs/adr/](../apps/alpha-etl/docs/adr)                                                                                                                                                                                                      |
| analytics-engine | [CLAUDE.md](../apps/analytics-engine/CLAUDE.md) · [coding_standards](../apps/analytics-engine/docs/coding_standards.md) · [snapshot_architecture](../apps/analytics-engine/docs/snapshot_architecture.md) · [sql_parameter_audit](../apps/analytics-engine/docs/sql_parameter_audit.md) |
| desktop | [CLAUDE.md](../apps/desktop/CLAUDE.md)                                                                                                                                                                                                                                         |
| landing-page     | [CLAUDE.md](../apps/landing-page/CLAUDE.md) · `content/docs/*.mdx` (published site docs)                                                                                                                                                                                                |
| app        | [README.md](../apps/app/README.md) · [CLAUDE.md](../apps/app/CLAUDE.md)                                                                                                                                                                                                     |
| podcast-pipeline | [CLAUDE.md](../apps/podcast-pipeline/CLAUDE.md)                                                                                                                                                                                                                                         |

Nested module docs also exist (e.g. `apps/account-engine/src/modules/*/CLAUDE.md`,
`packages/app-core/src/services/CLAUDE.md`, `packages/intent-engine/src/protocols/CLAUDE.md`).
Read them when you're working in that directory.

## Shared packages

`packages/*` each carry a short `CLAUDE.md`: design-tokens, eslint-config,
intent-engine ([+ gmx-v2 notes](../packages/intent-engine/docs/gmx-v2-implementation-notes.md)),
knip-config, tsconfig, types.

## Tooling & automation

| Where                                | What                                                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [.agents/skills/](../.agents/skills) | Agent skills for debugging CI/build/test/coverage/lint failures locally; symlinked to `.claude/skills`. Start at `monorepo-ci-debugging` — it routes to the focused sibling skills. |
| [.ai/](../.ai)                       | **Advisory** scanner playbooks (architecture-guard, repo-hygiene-scan, repo-config-hygiene, docs-code-sync, docs-maintain, todos-planner). Output feeds `.todos/`. Not CI gates.    |
| `scripts/`                           | Dispatchers behind `pnpm <verb>` (verify, build, test, lint, format, coverage, contracts, security, dev). Run `pnpm <verb> --help` for subcommands.                                 |

## Verification quick reference

| Goal                                  | Command                                            |
| ------------------------------------- | -------------------------------------------------- |
| Local gate — see all failures at once | `pnpm verify` (= `pnpm verify parallel`)           |
| AI fix inner loop (affected only)     | `pnpm verify changed`                              |
| Before push                           | `pnpm verify branch`                               |
| CI canonical gate (sequential)        | `pnpm verify ci`                                   |
| Separate CI-only checks               | `pnpm security audit` · `pnpm coverage check`      |

`verify ci` / `parallel` do **not** include security audit or coverage — run
those separately. Full table + the `.ai-verify/result.json` fix loop:
[CLAUDE.md → Verification hierarchy](../CLAUDE.md#verification-hierarchy).

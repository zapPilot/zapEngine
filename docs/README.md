# Documentation

Keep repository documentation small and operational. The source-of-truth order is:

1. Code, tests, schemas, and checked-in configuration
2. The nearest scoped instruction file; `AGENTS.md` is canonical at every scope and the `CLAUDE.md`/`GEMINI.md` beside it are compatibility entry points only
3. Architecture decisions and operational runbooks
4. GitHub Issues for unfinished work

Do not use Markdown files as a long-lived TODO system.

## Start here

- [README.md](../README.md) — product overview, repository layout, setup, and common commands
- [AGENTS.md](../AGENTS.md) — repository-wide engineering principles
- [CONTRIBUTING.md](../CONTRIBUTING.md) — daily development and verification workflow
- [current architecture](./architecture/current.md) — deployed topology, data ownership, scheduling, and infrastructure sources of truth
- [architecture planes](./architecture/planes.md) — durable cross-service boundaries
- The app or package's own `README.md` and nearest scoped instruction file

## Shared docs

- [app-layout.md](./app-layout.md) — default layout for new TypeScript server apps
- [track-record-pipeline.md](./track-record-pipeline.md) — current track-record snapshot runbook
- [EIP-7702 session scoping](./spikes/2026-07-07-eip7702-session-scoping.md) — retained wallet-policy decision and revalidation triggers
- [Supabase CLI migration workflow](./spikes/2026-08-22-supabase-cli-migration-workflow.md) — single-workdir baseline and manual production-apply decision
- [schedule registry](./schedules.md) — canonical inventory, trust levels, validation, and recovery
- [product strategy](./product-strategy/README.md) — stable positioning only; execution work belongs in Issues

Deeper implementation docs live beside the code under `apps/*/docs/` or `packages/*/docs/`.

## Documentation rules

- Do not commit temporary implementation plans or generated Superpowers specs. `docs/superpowers/` is ignored.
- Do not duplicate commands or invariants already covered by a scoped instruction file.
- A document must describe current behavior, a durable decision, or a recovery procedure.
- Move actionable work to GitHub Issues. Avoid unchecked task lists in docs.
- Delete or reduce a document once code and tests express the same information.
- Update a referenced document in the same change when behavior changes.

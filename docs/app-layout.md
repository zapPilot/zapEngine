# App `src/` layout convention

Canonical layout for **new TypeScript server apps** in this monorepo (the next
one being `apps/plan-orchestration` when it gets extracted from
`account-engine`). Existing apps may diverge — see "Legacy divergence" below.

This doc codifies what is _already_ true across 4–5 apps. It is not a
refactor mandate; it is a target so new code stops re-inventing.

---

## TS server apps (Hono / Express)

```
src/
├── main.ts          # process bootstrap (entry point); thin
├── app.ts           # framework init: middleware, routes, container
├── config/          # env loading (Zod schema), settings
├── routes/          # HTTP route handlers; one file per resource
├── services/        # business logic; plain functions, no classes
├── lib/             # cross-cutting helpers (logger, http client, etc.)
├── common/          # shared infra: error types, validation, guards
├── middleware/      # framework middleware (auth, error handler) — optional
├── types/           # shared TS interfaces / type aliases
└── modules/         # OPTIONAL: cohesive feature bundles (rare; see below)
```

### Per-directory rules

- **`config/`** — exactly one `env.ts` exporting a typed, parsed `env` object
  via Zod. App config beyond env (constants, runtime settings) lives here too.
- **`routes/`** — files map 1:1 to URL prefixes (e.g. `users.ts` →
  `/users/*`). No business logic — delegate to `services/`.
- **`services/`** — **plain functions**, no classes. `CLAUDE.md` is explicit
  on this: _"Service/API logic: plain functions in `src/services/`, no
  classes"_. Service files own a domain (`portfolio.ts`, `subscription.ts`),
  not a layer (no `repository.ts` / `usecase.ts` / `controller.ts` ladders).
- **`lib/`** — re-usable helpers that aren't business-domain (HTTP wrappers,
  date formatting, retry/backoff). Distinct from `services/` (domain) and
  `common/` (app-shaped infra).
- **`common/`** — shared error classes (`AppError`, `HttpException`),
  request validators, auth guards. Things every route+service touches.
- **`middleware/`** — framework-specific middleware. Hono/Express only.
  Skip the directory if the app uses one or two inline.
- **`types/`** — local interfaces. Cross-app types belong in
  `packages/types`, not here.
- **`modules/`** — only when a feature has 5+ files and zero coupling to
  other features (account-engine's `notifications/` is the type). Default
  to flat `services/` + `routes/` until coupling forces grouping.

### Naming decisions

- **`lib/` vs `utils/`** — prefer `lib/`. Use `utils/` only when porting code
  that already has the name; don't introduce both.
- **`common/` vs `core/`** — prefer `common/`. account-engine uses
  `common/`; alpha-etl uses `core/` for infra plus pipeline glue. New apps
  use `common/`; alpha-etl's `core/` is legacy and not the model.
- **`services/` vs `modules/`** — start with flat `services/`. Promote to
  `modules/<feature>/` only when files multiply (>5) AND the feature has its
  own internal services + types + routes that don't bleed.

---

## Frontend apps (React + Vite, Next.js)

Frontend layout is **framework-driven** — don't try to align with the
server convention. Current state:

- `apps/mobile-v2` (Expo / React Native universal app): expo-router routes in
  `app/` with screens/components under `src/`; shared business logic lives in
  `packages/app-core` (hooks/services/adapters), not in the app.
- `apps/landing-page` (Next.js App Router): standard Next layout —
  `app/`, `components/`, `lib/`, `data/`, `config/`.

If you add a new frontend app: copy the framework's recommended layout
(Vite docs / Next docs / Expo docs), then mirror the existing apps'
sub-conventions (`lib/<domain>/`, `hooks/<scope>/`).

---

## Legacy divergence (do not retrofit)

Documented so reviewers understand why existing apps look different — **not
a TODO list**:

| App                | Divergence                                                        | Why                                                                                |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `account-engine`   | `modules/` with classes + DI `container.ts`                       | early NestJS-style scaffolding; classes haven't been ported to plain functions yet |
| `alpha-etl`        | `core/` instead of `common/`; `modules/<pipeline>/` is the domain | ETL pipelines really are isolated bundles — `modules/` fits                        |
| `podcast-pipeline` | very flat — no `routes/`, services tested inline                  | service is small enough that splitting would be ceremony                           |

These layouts are stable. Don't restructure them in a passing PR — wait
for organic refactors that already touch the area.

---

## When extracting `apps/plan-orchestration`

The extraction PR should use the canonical layout above. Specifically:

- `src/config/env.ts` — typed env via Zod (good candidate to consume a future
  `packages/env-config` if/when extracted)
- `src/routes/` — `POST /plan-orchestration/deposit`, `POST /plan-orchestration/rebalance`
- `src/services/` — strategy→intent normalization (the hard part)
- `src/common/` — error types shared with the contract in `@zapengine/types`
- **no** `modules/` directory at extraction time — start flat, grow only if forced

See [apps/account-engine/docs/plan-orchestration-evolution.md](../apps/account-engine/docs/plan-orchestration-evolution.md)
for the staged extraction roadmap.

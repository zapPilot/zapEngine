# TypeScript server app layout

Default layout for **new** TypeScript server apps. Existing apps are not required to retrofit it.

```text
src/
├── main.ts       # process bootstrap
├── app.ts        # framework setup and route registration
├── config/       # typed env and runtime configuration
├── routes/       # HTTP boundary; no business logic
├── services/     # domain logic as plain functions
├── lib/          # reusable infrastructure helpers
├── common/       # shared errors, validation, and guards
├── middleware/   # framework middleware, when needed
├── types/        # app-local types
└── modules/      # only for large, cohesive features
```

## Rules

- Parse environment variables once in `config/env.ts`, preferably with Zod.
- Route files map to URL resources and delegate business logic to `services/`.
- Prefer plain functions over service classes.
- Put cross-app contracts in `packages/types`, not local `types/`.
- Prefer `lib/` over adding a second generic `utils/` directory.
- Start flat. Introduce `modules/<feature>/` only when a feature has several tightly related files and a clear internal boundary.
- Follow framework conventions for frontend apps instead of applying this server layout.

Existing exceptions are intentional: account-engine retains older DI/classes, alpha-etl is pipeline-module oriented, and podcast-pipeline is small enough to remain flat. Do not restructure them in unrelated changes.

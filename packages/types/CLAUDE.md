See @../../CLAUDE.md for monorepo development guidelines, and the package [README](./README.md) for the subpath layout table.

# Package-Specific Constraints

## Subpaths > root barrel

`@zapengine/types` exposes four subpath exports — `./strategy`, `./api`, `./etl`, `./shared`. New code should import from a subpath; the root barrel is kept for backward compatibility but pulls everything.

## Wire-contract types live here

Any type that travels over HTTP or appears in a stored payload should be defined here (not in app `src/types/`). This is what keeps the analytics-engine Python ↔ TypeScript contract verifiable via `pnpm contracts:check`.

- **Strategy contracts** (`./strategy`) — backtesting / suggestion / allocation shapes shared with analytics-engine
- **API contracts** (`./api`) — `POST /plan-orchestration/*`, market dashboard, deposit endpoint shapes
- **ETL contracts** (`./etl`) — alpha-etl webhook + status shapes
- **Shared primitives** (`./shared`) — `MarketFreshness`, `Wallet`, etc.

## Adding a new wire-contract type

1. Define it with a Zod schema (`z.object({...})`) plus an inferred TS type.
2. Add to the correct `src/<subpath>/`.
3. Export from the subpath's `index.ts` and (for backward compat only) the root `index.ts` will pick it up automatically via `export *`.
4. Update the matching Pydantic model in `apps/analytics-engine/src/models/` if the type crosses the analytics boundary.
5. Run `pnpm contracts:check` — this is the gate that catches drift before it ships.

## Build order trap

This package's TypeScript build (`tsc`) emits to `dist/`. Apps that consume `@zapengine/types` via Turbo automatically rebuild because of `dependsOn: ["^build"]`. But `pnpm --filter @zapengine/types type-check` on its own will fail if `dist/` is missing — use `pnpm turbo run type-check --filter=@zapengine/types` or `pnpm prebuild:packages` first.

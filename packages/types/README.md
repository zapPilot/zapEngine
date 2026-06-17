# @zapengine/types

Shared TypeScript types and Zod schemas for the zapEngine monorepo.

## Subpath layout

Types are partitioned by concern. **Prefer subpath imports** so an app pulls in only what it needs.

| Subpath                     | What lives here                                                               | Typical consumers                                   |
| --------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| `@zapengine/types/strategy` | Strategy presets, allocations, buckets, backtesting, suggestions, JSON shapes | analytics-engine ↔ frontend / account-engine        |
| `@zapengine/types/api`      | HTTP contracts (deposit, market dashboard) shared between FE and BE           | account-engine, frontend, landing-page              |
| `@zapengine/types/etl`      | ETL pipeline DTOs and job status shapes                                       | alpha-etl, account-engine                           |
| `@zapengine/types/shared`   | Cross-domain primitives (market freshness, wallet)                            | All apps                                            |
| `@zapengine/types`          | **Backward-compat barrel** — re-exports everything                            | Legacy import sites; new code should pick a subpath |

## Usage

```typescript
// Preferred — subpath imports
import { StrategyPreset, SuggestionInput } from '@zapengine/types/strategy';
import { DepositRequest } from '@zapengine/types/api';
import { EtlJobStatus } from '@zapengine/types/etl';
import { MarketFreshness } from '@zapengine/types/shared';

// Allowed but discouraged — pulls the whole barrel
import { StrategyPreset, DepositRequest } from '@zapengine/types';
```

## Adding a new type

1. Pick the right subpath. If none fit, propose a new subpath rather than dropping a loose file in `src/`.
2. Add the type / Zod schema in `src/<subpath>/<file>.ts`.
3. Re-export it from `src/<subpath>/index.ts`.
4. Run `pnpm --filter @zapengine/types build` to refresh `dist/`.
5. If the type is part of a wire contract with analytics-engine (Python), update the matching Pydantic model and run `pnpm contracts check`.

## Build

```bash
pnpm build
```

See [CLAUDE.md § Build order](../../CLAUDE.md#build-order) — direct `pnpm --filter @zapengine/types type-check` requires `pnpm build packages` first.

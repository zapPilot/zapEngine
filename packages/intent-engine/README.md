# @zapengine/intent-engine

DeFi intent routing and execution logic for Zap Pilot.

## Overview

TypeScript library for constructing and validating DeFi transaction intents:

- **Route optimization**: Finds optimal paths across DEXs and protocols
- **Intent validation**: Zod schemas for transaction safety
- **Protocol adapters**: Morpho, and other integrated protocols

## Usage

```typescript
import { createIntent, validateRoute } from "@zapengine/intent-engine";
import { morphoRoutes } from "@zapengine/intent-engine/morpho";
```

## Exports

| Path                              | Description                 |
| --------------------------------- | --------------------------- |
| `@zapengine/intent-engine`        | Core routing and validation |
| `@zapengine/intent-engine/types`  | Type definitions            |
| `@zapengine/intent-engine/morpho` | Morpho protocol adapter     |

## Build

```bash
pnpm build
```

See [CLAUDE.md](../../CLAUDE.md) for monorepo development guidelines.

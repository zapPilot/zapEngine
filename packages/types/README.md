# @zapengine/types

Shared TypeScript types and Zod schemas for the zapEngine monorepo.

## Overview

This package provides type definitions used across multiple applications:

- **ETL types**: Data ingestion pipelines (`@zapengine/types/etl`)
- **API types**: Service contracts and response shapes (`@zapengine/types/api`)
- **Core types**: Base domain models and shared schemas

## Usage

```typescript
// Main exports
import { PoolSnapshot, WalletSnapshot } from '@zapengine/types';

// ETL-specific types
import { DefiLlamaPool, DeBankPosition } from '@zapengine/types/etl';

// API-specific types
import { PortfolioResponse, RiskMetrics } from '@zapengine/types/api';
```

## Build

```bash
pnpm build
```

See [CLAUDE.md](../../CLAUDE.md) for monorepo development guidelines.

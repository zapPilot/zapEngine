# @zapengine/types

Shared TypeScript types and Zod schemas for the zapEngine monorepo.

## Overview

This package provides type definitions used across multiple applications:

- **ETL types**: Data ingestion pipelines (`@zapengine/types/etl`)
- **API types**: Service contracts and response shapes (`@zapengine/types/api`)
- **Core types**: Base domain models and shared schemas

## Usage

```typescript
// Main exports (ETL + API types)
import { JobStatus, EtlJobStatus, ApiResult, ApiError } from '@zapengine/types';

// ETL-specific types
import { EtlErrorCode, EtlError, EtlJobCreated } from '@zapengine/types/etl';

// API-specific types
import { ErrorCode, ErrorContext, DataSource } from '@zapengine/types/api';
```

## Build

```bash
pnpm build
```

See [CLAUDE.md](../../../CLAUDE.md) for monorepo development guidelines.

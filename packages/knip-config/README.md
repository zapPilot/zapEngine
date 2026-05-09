# @zapengine/knip-config

Shared base configuration for [knip](https://knip.dev) dead-code detection across all TypeScript workspaces.

## Overview

Exposes a `defineKnipConfig(config)` helper that merges per-workspace overrides on top of a shared `baseConfig`:

- Adds `@zapengine/eslint-config` and `@zapengine/knip-config` to `ignoreDependencies` automatically (prevents false positives on the workspace tooling packages)
- Sets `ignoreExportsUsedInFile: true` and `eslint.config: ['eslint.config.mjs']` as defaults
- Per-workspace `ignoreDependencies` are deep-merged with the base list (deduplicated), not replaced

## Usage

```ts
// apps/account-engine/knip.ts
import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  project: ['src/**/*.ts'],
  ignore: ['**/*.spec.ts'],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['test/unit/**/*.spec.ts'],
  },
});
```

The result is consumed by `knip` via `pnpm deadcode` / `pnpm deadcode:fix` in each workspace's `package.json`.

## When to edit

- **Adding a workspace package that's a dev-only tool**: add it to `ignoreDependencies` here so every consumer benefits
- **Changing default knip behavior**: edit `baseConfig` here rather than duplicating overrides in each `knip.ts`

See [CLAUDE.md](../../CLAUDE.md) for monorepo development guidelines.

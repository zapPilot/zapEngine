# @zapengine/design-tokens

Shared Zap Pilot brand tokens for TypeScript and CSS consumers.

## Overview

A single source of truth — `tokens.json` — drives generated outputs for every consumer:

- **TypeScript token objects** (`dist/tokens.js`, `dist/index.js`) — colors, radii, spacing, typography
- **CSS custom properties** (`dist/css/variables.css`) — for non-Tailwind consumers

## Usage

### TypeScript

```typescript
import { tokens } from '@zapengine/design-tokens';
```

### Web (CSS variables, no Tailwind)

```css
@import '@zapengine/design-tokens/css/variables.css';
```

## Editing tokens

1. Edit `tokens.json`.
2. Run `pnpm build` — this runs `codegen:css`, `codegen:ts`, and `tsc` in order.
3. Commit `tokens.json` and `dist/` together. The generated outputs are checked in so consumers don't need to rebuild this package on install.

## Build

```bash
pnpm build       # codegen + tsc
pnpm dev         # tsc --watch (codegen runs once on entry)
pnpm clean       # rm -rf dist
```

See [packages/AGENTS.md](../AGENTS.md) for shared package guidelines.

# @zapengine/design-tokens

Shared Zap Pilot brand tokens for web (TypeScript / Tailwind / CSS variables).

## Overview

A single source of truth — `tokens.json` — drives generated outputs for every consumer:

- **TypeScript token objects** (`dist/tokens.js`, `dist/index.js`) — colors, radii, spacing, typography
- **Tailwind preset** (`dist/tailwind-preset.js`) — drop into a `tailwind.config` `presets` array
- **CSS custom properties** (`dist/css/variables.css`) — for non-Tailwind consumers

## Usage

### Web (TypeScript / Tailwind)

```typescript
// Tailwind config
import zapTokens from '@zapengine/design-tokens/tailwind-preset';

export default {
  presets: [zapTokens],
  // ...
};

// Direct token access
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

See [CLAUDE.md](../../CLAUDE.md) for monorepo development guidelines.

# @zapengine/design-tokens

Shared Zap Pilot brand tokens for web (TypeScript / Tailwind / CSS variables) and mobile (Flutter / Dart).

## Overview

A single source of truth — `tokens.json` — drives generated outputs for every consumer:

- **TypeScript token objects** (`dist/tokens.js`, `dist/index.js`) — colors, radii, spacing, typography
- **Tailwind preset** (`dist/tailwind-preset.js`) — drop into a `tailwind.config` `presets` array
- **CSS custom properties** (`dist/css/variables.css`) — for non-Tailwind consumers
- **Flutter / Dart constants** (`lib/design_tokens.dart`) — used by `apps/mobile`

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

### Mobile (Flutter)

```dart
import 'package:zap_design_tokens/design_tokens.dart';
```

(The Dart package is published from `lib/design_tokens.dart` via `pubspec.yaml`.)

## Editing tokens

1. Edit `tokens.json`.
2. Run `pnpm build` — this runs `codegen:css`, `codegen:flutter`, and `tsc` in order.
3. Commit `tokens.json`, `dist/`, and `lib/design_tokens.dart` together. The generated outputs are checked in so consumers don't need to rebuild this package on install.

## Build

```bash
pnpm build       # codegen + tsc
pnpm dev         # tsc --watch (codegen runs once on entry)
pnpm clean       # rm -rf dist lib/design_tokens.dart
```

See [CLAUDE.md](../../CLAUDE.md) for monorepo development guidelines.

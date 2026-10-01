# @zapengine/design-tokens

`tokens.json` is the single source of truth for Zap Pilot's dark interface: champagne gold, readable neutral text, Instrument Serif headings, Geist controls, and JetBrains Mono numeric values.

## Consumers

- `apps/app` reads the static TypeScript module and JSON theme. Runtime font names match the families loaded by Expo.
- `apps/landing-page` and `apps/control-center` import generated CSS variables. Landing uses its own Tailwind v4 CSS configuration.
- `apps/podcast-pipeline` reads the static colors for branded video templates.

```typescript
import { tokens } from '@zapengine/design-tokens/tokens';
```

```css
@import '@zapengine/design-tokens/css/variables.css';
```

The 14 typography roles specify size, line height, and tracking in pixels. Layout, motion, control sizes, and runtime font families remain TypeScript/JSON only. CSS emits colors, radii, typography, shadows, easing, durations, and the Fumadocs aliases; it does not emit font or container names that collide with Tailwind.

Use `ink-muted` for small secondary text. `ink-faint` is reserved for disabled controls and decoration. The minimum text size is 11px and the minimum hit target is 44px on both web and native.

## Editing and verifying

Edit `tokens.json`, then regenerate through Turbo:

```bash
pnpm turbo run build type-check lint test deadcode dup:check --filter=@zapengine/design-tokens
pnpm --filter @zapengine/design-tokens format:check
```

Keep `tokens.json`, `src/generated/tokens.ts`, and `dist/` together in the change. Never edit generated output by hand. Renaming a token requires migrating every consumer in the same change; obsolete aliases and Flutter output are removed.

See [packages/AGENTS.md](../AGENTS.md) for shared package guidelines.

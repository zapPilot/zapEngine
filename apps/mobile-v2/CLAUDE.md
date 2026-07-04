See @../../CLAUDE.md for monorepo development guidelines.

# Mobile V2 Guardrails

## Platform Boundaries

- `src/integration/**` is shared business logic. It must not import
  `react-native`, screen components, route APIs, or native-only UI modules.
- React Native imports belong in `src/screens/**`, `src/components/**`, and
  `src/providers/**`.
- Do not import DOM/web-only packages in mobile-v2: `lucide-react`,
  `react-router-dom`, `recharts`, `hls.js`, or `react-dom`.
- Web-specific implementations for Phase 4 should use platform split files such
  as `.web.ts` / `.web.tsx`.

## Styling Rules

- Use NativeWind classes backed by `@zapengine/design-tokens/tokens.json`.
- RN does not match font weights for runtime-loaded fonts; use explicit families:
  `font-sans-medium`, `font-sans-semibold`, `font-sans-bold`, and the matching
  mono variants.
- Convert web letter spacing from `em` to absolute pixels before porting.
- Use `ScrollView` for vertical screen content, `expo-linear-gradient` for
  linear gradients, and `GlowCircle` for radial glow treatments.

## Verification

Use the workspace gate before handoff:

```bash
pnpm turbo run type-check lint test build --filter=@zapengine/mobile-v2
pnpm --filter @zapengine/mobile-v2 format:check
pnpm turbo run deadcode dup:check --filter=@zapengine/mobile-v2
```

When commands invoke `tsx` through package builds, run them with the repo
Corepack pnpm shim so the root `packageManager` is honored.

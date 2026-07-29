See @../../CLAUDE.md for monorepo development guidelines.

# Mobile V2 Guardrails

## Platform Boundaries

- `src/integration/**` is shared business logic. It must not import
  `react-native`, screen components, route APIs, or native-only UI modules.
- React Native imports belong in `src/screens/**`, `src/components/**`, and
  `src/providers/**`.
- Do not import DOM/web-only packages in app: `lucide-react`,
  `react-router-dom`, `recharts`, `hls.js`, or `react-dom`.
- Web-specific implementations for Phase 4 should use platform split files such
  as `.web.ts` / `.web.tsx`.

## Podcast Persistence Invariants

- Native podcast progress and playback-speed preferences must use durable
  device storage. Never rely on `globalThis.localStorage` for native state.
- Flush the latest podcast position when the app becomes inactive/backgrounded,
  playback pauses, the episode or section changes, and the tracker unmounts.
- Resume logic must wait for durable storage hydration. Hydration must merge
  changes made while storage is loading, and asynchronous writes must preserve
  newest-value ordering.
- Changes to the podcast progress provider, tracker, or storage adapter must
  pass the podcast persistence and lifecycle tests.

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
pnpm turbo run type-check lint test build --filter=@zapengine/app
pnpm --filter @zapengine/app format:check
pnpm turbo run deadcode dup:check --filter=@zapengine/app
```

When commands invoke `tsx` through package builds, run them with the repo
Corepack pnpm shim so the root `packageManager` is honored.

## Native builds and stale `packages/*/dist`

Xcode's "Bundle React Native code and images" phase runs `expo export:embed`
directly and never invokes Turbo, so `packages/*/dist` can drift behind `src`.
The app resolves `@zapengine/app-core`, `types`, `intent-engine`, and
`design-tokens` through `dist`, so drift surfaces as
`Unable to resolve module @zapengine/…` rather than anything naming the cause.

`metro.config.js` calls `scripts/assert-workspace-dist-fresh.cjs` before
anything else. It **fails** when a `src` file has no corresponding `dist` emit,
and only **warns** when `src` is merely newer by mtime — Turbo hashes content,
so `touch` and branch switches leave `src` newer while a rebuild is a genuine
no-op, and a hard error there would be unfixable. When the guard fires:

```bash
pnpm turbo run build --filter=@zapengine/app-core
```

The `ios`, `android`, and `start` scripts rebuild first, so in practice only
Xcode ⌘R reaches the guard. It is skipped under `CI` (Turbo already orders
`^build`) and via `ZAP_SKIP_DIST_FRESHNESS_CHECK=1`. Do not add the rebuild
prefix to `dev` or `dev:web` — those are Turbo task names that already declare
`dependsOn: ["^build"]`, and nesting a Turbo call inside a Turbo task errors.

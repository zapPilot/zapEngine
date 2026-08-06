See @../AGENTS.md for shared application guidelines.

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

# Required for iOS dependency/config/release changes on macOS
pnpm turbo run test:ios:release-smoke --filter=@zapengine/app
```

When commands invoke `tsx` through package builds, run them with the repo
Corepack pnpm shim so the root `packageManager` is honored.

## Store releases

Runbooks live in [docs/android-release.md](./docs/android-release.md) and
[docs/ios-release.md](./docs/ios-release.md). Do not restate them here. Four
invariants are easy to break without noticing:

- `scripts/eas.mjs` owns the only pinned EAS CLI version and the `CI` →
  `--non-interactive` rule. Never write `eas-cli@<version>` anywhere else.
- `autoIncrement` consumes a store version number on every build attempt,
  including failures. That is why `release-mobile.yml` is `workflow_dispatch`
  only and holds a single global, never-cancelled concurrency slot.
- Submission is filtered to the production/store/finished build and submitted by
  ID. An unfiltered `eas submit --latest` can pick an internal-distribution
  build that the store then shadows.
- Android submits to the closed testing `alpha` track. Widening the audience is a
  Play Console action, never a repository or CI change.

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

`ios:archive` rebuilds the app-core dependency graph before opening Xcode.
Turbo-driven tasks also order `^build`; the freshness guard is skipped under
`CI` and via `ZAP_SKIP_DIST_FRESHNESS_CHECK=1`. Do not add a nested Turbo build
to `dev` or `dev:web` — those tasks already declare `dependsOn: ["^build"]`.

## Native dependency synchronization

The generated `ios/` directory is ignored and can outlive a JavaScript native
dependency change. Xcode's `[CP] Check Pods Manifest.lock` only compares two
generated lockfiles, so two equally stale files are not proof that
`package.json` and the executable agree.

- Use `pnpm --filter @zapengine/app ios:native:sync` before native work.
- Use `pnpm --filter @zapengine/app ios:archive` before Product → Archive.
- Never open the `.xcodeproj`; use the generated `.xcworkspace`.
- `metro.config.js` calls `assert-ios-native-dependencies.cjs` during iOS
  Release bundling. It rejects missing/mismatched cold-start Pods even when a
  developer bypasses the supported archive command.
- CI runs `test:ios:release-smoke` on `macos-26` for app/native-related changes.
  It clean-prebuilds, installs Pods, builds Release, installs it in a simulator,
  and proves the process survives cold start.

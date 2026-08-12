See @../AGENTS.md for shared application guidelines.

# Mobile app guardrails

## Platform boundaries

- `src/integration/**` is shared business logic and must stay free of `react-native`, screen/router APIs, and native-only UI modules.
- React Native UI/runtime imports belong in screens, components, providers, or platform-specific files.
- Do not import DOM/web-only packages such as `lucide-react`, `react-router-dom`, `recharts`, `hls.js`, or `react-dom` into native code paths.
- Use `.web.ts` / `.web.tsx` platform splits for genuinely web-only implementations.

## Podcast persistence

- Native progress and playback-speed state must use durable device storage, never `globalThis.localStorage`.
- Flush current position on background/inactive, pause, episode/section change, and tracker unmount.
- Resume waits for storage hydration. Hydration must merge changes made while loading, and async writes must preserve newest-value ordering.
- Changes to progress, tracker, or storage behavior must pass the podcast persistence/lifecycle tests.

## UI implementation

- Use NativeWind classes backed by `@zapengine/design-tokens` rather than introducing a parallel token system.
- Runtime-loaded font weights use explicit font-family variants; do not rely on React Native to synthesize the desired weight.
- Keep native scrolling/gradient/glow primitives on the existing React Native/Expo implementations rather than importing web substitutes.

## Verification

Before handoff for app changes, run the relevant workspace gates through Turbo. The full app gate is:

```bash
pnpm turbo run type-check lint test build --filter=@zapengine/app
pnpm --filter @zapengine/app format:check
pnpm turbo run deadcode dup:check --filter=@zapengine/app
```

For iOS dependency/config/release changes on macOS also run:

```bash
pnpm turbo run test:ios:release-smoke --filter=@zapengine/app
```

## Store releases

Canonical procedures live in [docs/android-release.md](./docs/android-release.md) and [docs/ios-release.md](./docs/ios-release.md). Keep these invariants aligned with them:

- `scripts/eas.mjs` is the single pinned EAS CLI entry point.
- Store builds use `autoIncrement`; failed build attempts can consume store version numbers, so release workflow concurrency/cancellation semantics are load-bearing.
- Submission selects the intended finished production/store build by ID. Do not replace that logic with an unfiltered `eas submit --latest`.

## Native workspace freshness

- Xcode bundling does not run Turbo. `metro.config.js` uses `scripts/assert-workspace-dist-fresh.cjs` to catch missing/stale internal package output.
- Rebuild affected internal packages instead of bypassing the freshness guard. Do not add nested Turbo builds to `dev` or `dev:web`.
- The generated `ios/` tree can outlive JavaScript dependency changes. Run `pnpm --filter @zapengine/app ios:native:sync` before native work and `pnpm --filter @zapengine/app ios:archive` for supported archives.
- Open the generated `.xcworkspace`, not `.xcodeproj`.
- `scripts/assert-ios-native-dependencies.cjs` and the iOS release smoke test are the guardrails against stale Pods/native dependency drift.

## Patched Expo modules

- The repo patches `expo-audio` and `expo-video` for lock-screen/media-session behavior. These are native patches, so JS-only tests cannot prove they are active.
- Android can prefer Expo's prebuilt AAR and ignore Kotlin source patches. `apps/app/package.json` deliberately lists `expo-audio` in `expo.autolinking.android.buildFromSource`; removing it can silently disable the patch while builds stay green.
- When changing the Kotlin patch or autolinking mode, verify the source project resolves/compiles with `./gradlew :expo-audio:compileReleaseKotlin` from the generated Android project.

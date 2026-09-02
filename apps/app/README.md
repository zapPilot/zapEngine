# Zap Pilot App

Universal Expo React Native workspace for Zap Pilot across iOS, Android, and web.
The Electron desktop shell packages this app's static web export.

The iOS App Store build ships podcast-only: `FinancialFeatureRoute` and a set
of `.ios.tsx`/`.ios.ts` platform splits keep the wallet, invest, and send
surfaces (and their imports) out of the iOS app and bundle, because App Store
Guideline 3.1.5(b)(i) blocks wallet functionality for a personal developer
account without a legal entity. Android and web keep the full DeFi feature set.

## Runtime

This app uses Expo development builds via `expo-dev-client`; it is not intended
for Expo Go. Mobile authentication is wired through Privy's Expo SDK path and
expects:

```bash
PRIVY_MOBILE_APP_ID=...
PRIVY_MOBILE_CLIENT_ID=... # Privy mobile app client
```

Do not reuse a Privy web client ID in an Android or iOS build.

Native identifiers:

- iOS development bundle: `com.zapengine.zappilot.dev`
- Android production package: `com.fromfedtochain.app`

The Android package intentionally preserves the existing Google Play listing and
upload certificate from the retired Flutter app. The store-facing app name is
`Zap Pilot`.

## Commands

```bash
# One Metro server on port 8081 for web, iOS, and Android.
# Press W, I, or A in this terminal to open the target platform.
pnpm --filter @zapengine/app dev

# Browser-only shortcut when native development clients are not needed.
pnpm --filter @zapengine/app dev:web
pnpm turbo run type-check lint test build --filter=@zapengine/app
pnpm turbo run build:web test:e2e --filter=@zapengine/app
pnpm --filter @zapengine/app check:web-native-leaks
pnpm --filter @zapengine/app format:check
pnpm turbo run deadcode dup:check --filter=@zapengine/app

# Native compilation only (Metro must already be running via `dev`)
pnpm --filter @zapengine/app ios:native
pnpm --filter @zapengine/app android:native

# iOS archive and Release cold-start gate (macOS)
pnpm --filter @zapengine/app ios:native:sync
pnpm --filter @zapengine/app ios:archive
pnpm turbo run test:ios:release-smoke --filter=@zapengine/app

# iOS App Store release
pnpm --filter @zapengine/app ios:release   # runs ios:version:check preflight, then EAS build
pnpm --filter @zapengine/app ios:submit -- <EAS_BUILD_ID>
# standalone diagnostic:
pnpm --filter @zapengine/app ios:version:check

# Android Google Play release
pnpm --filter @zapengine/app android:release
pnpm --filter @zapengine/app android:submit -- <EAS_BUILD_ID>
pnpm --filter @zapengine/app android:publish
```

Every EAS command routes through `scripts/eas.mjs`, which owns the single pinned
EAS CLI version and adds `--non-interactive` when `CI` is set. Local runs stay
interactive so credential setup can still prompt.

## Android Studio development

For one-click emulator development, create a local Android Studio **Shell
Script** run configuration named `Zap Pilot (Expo)`:

```text
Working directory: repository root (the directory containing package.json)
Command: pnpm --filter @zapengine/app android
```

Start `pnpm --filter @zapengine/app dev` first, then select that configuration
and press Play only when a native rebuild is needed. Expo CLI boots or selects
the AVD, incrementally builds and installs the debug app, and opens Zap Pilot
without starting a second Metro server. The generated `android/.idea` directory
is ignored, so each checkout configures its own absolute path. A local
configuration may append `-- --device Pixel_8_API_36` to select that installed
AVD without prompting.

The standard Android `app` configuration remains useful for native debugging.
The development client connects to the shared Metro server on port 8081 through
the configured emulator fallback `http://10.0.2.2:8081`. The iOS Simulator uses
`http://localhost:8081`. Physical devices still need the Mac's LAN address or an
Expo tunnel.

`build` runs Expo native exports for Android and iOS, so it is the Metro graph
regression gate. `build:web` writes the static Expo web export to `dist/web`;
`test:e2e` serves that export through `scripts/serve-web.mjs` so route refreshes
exercise the same SPA fallback as Vercel. `check:web-native-leaks` parses web
sourcemaps and fails if native-only packages are present as sources or imports.
Use the Turbo command for workspace checks so upstream package builds are fresh.

`android:release` creates a signed production AAB with EAS Build and reports the
exact EAS build ID returned by that build. `android:submit` requires that exact
ID and uploads it to the Google Play Closed testing `alpha` track; it never
resolves a latest build. `android:publish` remains the EAS-managed one-command
build-and-submit convenience path. Complete the one-time credential and version
setup in [docs/android-release.md](./docs/android-release.md) before the first EAS
build.

`.github/workflows/release-mobile.yml` runs the release flow on GitHub Actions for
either platform, triggered manually from the Actions tab. Build and submit are
separate jobs, and the build ID is passed explicitly between them so a failed
submit can be retried without creating another binary. See
[docs/android-release.md](./docs/android-release.md#ci-release).

## iOS archive and TestFlight safety

The generated `ios/` directory is intentionally ignored. A direct Xcode open can
therefore retain Pods from an older `package.json`, even when its own
`Podfile.lock` and `Pods/Manifest.lock` still match. That can produce an IPA
whose JavaScript imports a native module that the executable never linked.

`ios:release` (which runs `ios:version:check` as a preflight) + `ios:submit -- <EAS_BUILD_ID>` are the
primary release path. The preflight refuses to build while EAS remote
versioning is below the recorded App Store Connect floor; the clean-source EAS
production profile then builds on Expo's macOS infrastructure, and submission
uploads only the exact build ID produced by that release. `ios:version:check`
remains available as a standalone diagnostic. Complete the one-time
credential and versioning setup in [docs/ios-release.md](./docs/ios-release.md)
first — `credentialsSource: remote` has no local fallback.

`ios:archive` remains the supported local archiving path, and is what to reach
for when EAS itself is the problem. It builds the workspace dependencies, applies
Expo config to the existing native project, runs `pod install`, verifies required
cold-start Pods, and opens `ZapPilot.xcworkspace`. Then choose **Product →
Archive** in Xcode. A Release bundle also runs the same dependency guard, so
bypassing the command with stale Pods fails the archive instead of emitting a
crash-on-launch app.

The macOS `test:ios:release-smoke` gate performs a clean Expo prebuild in CI,
builds the actual Release simulator app with embedded JavaScript, verifies
`RNCAsyncStorage` is linked, installs it, cold-launches it, and requires it to
remain alive for 15 seconds without fatal React Native log signatures. Failure
artifacts include the Xcode result bundle, build logs, simulator logs, and a
screenshot under `test-results/ios-release-smoke/`.

After this workflow has run on GitHub once, repository administration must mark
`ios-release-smoke` as a required `main` branch check. Workflow YAML creates and
runs the gate; the GitHub ruleset is what prevents merging around a red gate.

## Migration Notes

- `src/app/**` route files stay thin; screen bodies live in `src/screens/**`.
- `src/integration/**` is platform-neutral and must not import `react-native`.
- Native podcast playback uses `expo-audio`; web playback uses
  `podcastPlayer.web.ts` with Safari-native HLS or `hls.js`.
- UI code uses NativeWind classes plus design tokens from
  `@zapengine/design-tokens/tokens.json`; loaded RN fonts need explicit family
  classes such as `font-sans-semibold` instead of web font-weight matching.

## Phase 4 Web Parity Checklist

Before switching production traffic, run `dev:web` with account-engine and
analytics-engine locally, then repeat the critical items against the static
export served by `node scripts/serve-web.mjs --port 3100 --build-if-missing`.

- Privy web login works on the target origin.
- Six tabs render live data where a connected account has data.
- Invest flow reaches the real deposit-plan preview and wallet signature step.
- Send flow validates token, chain, amount, and recipient input.
- Podcast plays in Chrome through `hls.js` and in Safari through native HLS.
- Clipboard, route hard refreshes, query parameters, fonts, and icons work.
- Browser console has no red errors during the above flows.

## Phase 3 QA Checklist

Cold start, demo tabs, Privy login, live portfolio, range tabs, invest three-step
signing flow, activity, send validation, account copy/disconnect, podcast
play/pause/seek, and deep link `zappilotv2://home`.

On iOS this checklist only applies to podcast play/pause/seek, cold start, deep
link, and the Privy email sign-in/sign-out on the Account tab — Home, Strategy,
and Activity show the web-upsell card instead of live data, and invest/send/
wallet flows do not exist in the iOS build (see the podcast-only note above).

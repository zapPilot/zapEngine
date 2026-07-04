# Zap Pilot Mobile V2

Temporary Expo React Native workspace for the mobile migration. The Flutter app
in `apps/mobile` remains the stable production mobile app until this workspace
reaches feature parity.

## Runtime

This app uses Expo development builds via `expo-dev-client`; it is not intended
for Expo Go. Mobile authentication is wired through Privy's Expo SDK path and
expects:

```bash
EXPO_PUBLIC_PRIVY_APP_ID=...
EXPO_PUBLIC_PRIVY_CLIENT_ID=...
```

Initial native identifiers are deliberately separate from production:

- iOS: `com.zapengine.zappilot.dev`
- Android: `com.zapengine.zappilot.dev`

## Commands

```bash
pnpm --filter @zapengine/app dev
pnpm --filter @zapengine/app dev:web
pnpm turbo run type-check lint test build --filter=@zapengine/app
pnpm turbo run build:web test:e2e --filter=@zapengine/app
pnpm --filter @zapengine/app check:web-native-leaks
pnpm --filter @zapengine/app format:check
pnpm turbo run deadcode dup:check --filter=@zapengine/app
```

`build` runs Expo native exports for Android and iOS, so it is the Metro graph
regression gate. `build:web` writes the static Expo web export to `dist/web`;
`test:e2e` serves that export through `scripts/serve-web.mjs` so route refreshes
exercise the same SPA fallback as Vercel. `check:web-native-leaks` parses web
sourcemaps and fails if native-only packages are present as sources or imports.
Use the Turbo command for workspace checks so upstream package builds are fresh.

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

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
pnpm --filter @zapengine/mobile-v2 dev
pnpm turbo run type-check lint test build --filter=@zapengine/mobile-v2
pnpm --filter @zapengine/mobile-v2 format:check
pnpm turbo run deadcode dup:check --filter=@zapengine/mobile-v2
```

`build` runs Expo native exports for Android and iOS, so it is the Metro graph
regression gate. Use the Turbo command for workspace checks so upstream package
builds are fresh.

## Migration Notes

- `src/app/**` route files stay thin; screen bodies live in `src/screens/**`.
- `src/integration/**` is platform-neutral and must not import `react-native`.
- Native podcast playback uses `expo-audio`; the Phase 4 web target will add a
  `.web.ts` player for browser HLS.
- UI code uses NativeWind classes plus design tokens from
  `@zapengine/design-tokens/tokens.json`; loaded RN fonts need explicit family
  classes such as `font-sans-semibold` instead of web font-weight matching.

## Phase 3 QA Checklist

Cold start, demo tabs, Privy login, live portfolio, range tabs, invest three-step
signing flow, activity, send validation, account copy/disconnect, podcast
play/pause/seek, and deep link `zappilotv2://home`.

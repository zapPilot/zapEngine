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
pnpm turbo run type-check lint test --filter=@zapengine/mobile-v2
```

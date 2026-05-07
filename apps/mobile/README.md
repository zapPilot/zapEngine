# Mobile App

Polished Flutter podcast player for the AI Podcast POC.

The app reads episodes, likes, and listened state directly from Supabase. The
pipeline package remains responsible for ingest and audio generation.

This file is the canonical runbook for launching the Flutter app. The root
README links here instead of duplicating mobile commands.

## Supabase Config

The production Supabase URL, anon key, and schema are built into
`lib/main.dart` as `String.fromEnvironment` defaults:

- `SUPABASE_URL`: defaults to `https://urplxsioxepxopuababf.supabase.co`
- `SUPABASE_ANON_KEY`: defaults to the production anon key
- `SUPABASE_DB_SCHEMA`: defaults to `from_fed_to_chain`

Pass `--dart-define` only when intentionally overriding one of these values.
Supabase Data API must expose `from_fed_to_chain`; otherwise the mobile client
will get schema-cache errors even though the tables exist in SQL.

## Command Line

```bash
cd apps/mobile
flutter pub get
open -a Simulator
flutter devices
flutter run -d <simulator-udid>
```

If you only want to install and launch without a Flutter debug session:

```bash
cd apps/mobile
flutter build ios --simulator
xcrun simctl install booted build/ios/iphonesimulator/Runner.app
xcrun simctl launch booted com.example.fromFedToChainApp
```

## Xcode

Use the workspace, not the project file:

```bash
cd apps/mobile
flutter pub get
flutter build ios --simulator
open ios/Runner.xcworkspace
```

Then in Xcode:

1. Select the `Runner` scheme.
2. Select an iPhone simulator.
3. Press Run.

The `flutter build ios --simulator` step writes the generated iOS build
settings into `ios/Flutter/Generated.xcconfig`.

When you intentionally override any `--dart-define` value, include it in the
`flutter build ios --simulator ...` command and rerun that command before
running from Xcode again.

## Simulator Recovery

If booting a simulator fails with `cannot be located on disk`, the simulator
record is stale but its data directory is missing. Create a fresh simulator and
run against the new UDID:

```bash
xcrun simctl list runtimes
xcrun simctl list devicetypes | grep 'iPhone'
xcrun simctl create "Codex iPhone 17" \
  com.apple.CoreSimulator.SimDeviceType.iPhone-17 \
  com.apple.CoreSimulator.SimRuntime.iOS-26-4
xcrun simctl boot <new-simulator-udid>
open -a Simulator
flutter devices
```

Use the new UDID with `flutter run -d <new-simulator-udid> ...`.

## Legacy API Service

`API_BASE_URL` is only needed for legacy API-service tests or local experiments:

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:3010
```

Use `http://10.0.2.2:3000` for Android emulator.

# Mobile App

Polished Flutter podcast player for the AI Podcast POC.

The app reads episodes, likes, and listened state directly from Supabase. The
pipeline package remains responsible for ingest and audio generation.

This file is the canonical runbook for launching the Flutter app. The root
README links here instead of duplicating mobile commands.

## Supabase Config

The Supabase URL and anon key are not built into the app. Provide them with
`--dart-define` for any configured run:

```bash
flutter run \
  --dart-define=SUPABASE_URL=https://<project-ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon-key>
```

`SUPABASE_DB_SCHEMA` defaults to `from_fed_to_chain`, and can be overridden with
`--dart-define=SUPABASE_DB_SCHEMA=<schema>` for staging or test schemas.
Supabase Data API must expose `from_fed_to_chain`; otherwise the mobile client
will get schema-cache errors even though the tables exist in SQL.

If either `SUPABASE_URL` or `SUPABASE_ANON_KEY` is missing, the app launches in
the unconfigured auth state instead of initializing Supabase.

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

The `flutter build ios --simulator` step writes generated iOS build settings
into `ios/Flutter/Generated.xcconfig`.

For local Xcode-run debug builds, the Runner target reads `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and optional `SUPABASE_DB_SCHEMA` from the repo-root
`.env` during the Flutter build phase. If you change `.env`, just press Run
again in Xcode.

You can also regenerate Flutter's iOS config manually before opening Xcode:

```bash
pnpm --filter @zapengine/mobile ios:debug:prepare
open apps/mobile/ios/Runner.xcworkspace
```

Do not rely on `Runner` scheme > `Run` > `Arguments` > `Environment Variables`
for these values. The app reads them with Dart `String.fromEnvironment`, so
they must be compile-time `--dart-define` values.

## Android Play Store Release

The fastest release path is the Flutter CLI. Android Studio is useful for SDK
management and Gradle/signing debugging, but it is not required to create the
AAB. Keep using CLI builds unless you need to inspect native Android settings.

Before uploading a new Google Play build, bump the Flutter version with both the
marketing version and Android `versionCode`:

```yaml
version: 2.0.4+15
```

The repo-root `.env` must contain the production runtime config:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-or-publishable-key>
SUPABASE_DB_SCHEMA=from_fed_to_chain # optional; this is the default
```

Android release signing is read from `android/key.properties`, which must stay
local and must not be committed:

```properties
storeFile=/Users/chouyasushi/.android/zap-pilot-upload-20260627.jks
storePassword=<keystore-password>
keyAlias=upload
keyPassword=<key-password>
```

Build the signed release AAB from the mobile app directory:

```bash
cd /Users/chouyasushi/htdocs/zapEngine/apps/mobile

set -a
. ../../.env
set +a

flutter build appbundle --release \
  --dart-define=SUPABASE_URL="$SUPABASE_URL" \
  --dart-define=SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  --dart-define=SUPABASE_DB_SCHEMA="${SUPABASE_DB_SCHEMA:-from_fed_to_chain}"
```

The upload artifact is:

```bash
build/app/outputs/bundle/release/app-release.aab
```

Upload that `.aab` in Play Console to the target testing or production track.
If Play Console reports that the upload certificate does not match, do not
create a new app or change `applicationId`; request an upload-key reset for the
same Play Console app instead.

## iOS App Store Release

Before uploading a new App Store Connect build, bump the Flutter version with
both the marketing version and build number:

```yaml
version: 2.0.2+14
```

Then prepare the iOS config that Xcode Archive reads:

```bash
pnpm --filter @zapengine/mobile ios:release:prepare 2.0.2+14
open apps/mobile/ios/Runner.xcworkspace
```

Archive from Xcode with `Product > Archive`. The shared `Runner` scheme also
runs the same release-prep script automatically before Archive, so Xcode stays
in sync with `pubspec.yaml` even if you forget the manual command.

If App Store Connect reports an old `CFBundleShortVersionString`, run:

```bash
pnpm --filter @zapengine/mobile ios:release:prepare --deep-clean 2.0.2+14
```

The release-prep script regenerates `ios/Flutter/Generated.xcconfig`, which is
the file Xcode actually reads for `FLUTTER_BUILD_NAME` and
`FLUTTER_BUILD_NUMBER`.

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

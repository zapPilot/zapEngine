# Mobile App Notes

iOS release runbook (plist configs, repro commands, App Store version prep):
see [docs/ios-release.md](./docs/ios-release.md).

## iOS Background Audio (invariants)

Lock-screen audio depends on both Dart startup order and the native plist that
Xcode actually packages.

- `AudioService.init()` must run in `lib/main.dart` before `runApp()`.
- `PodcastAudioHandler` owns the `AudioPlayer`; do not reintroduce a lazy
  wrapper that creates `AudioService` on first play.
- The handler should publish the `MediaItem` before loading the HLS source,
  then update duration from `durationStream`.
- Do not move background audio into `Runner.entitlements`; iOS reads this
  from the app `Info.plist`.
- Each `Info-{Debug,Profile,Release}.plist` (plus the base `Info.plist`) must
  carry `AVAudioSessionCategoryPlayback` + `UIBackgroundModes: audio` — see
  the runbook for the exact XML and which file Xcode picks per configuration.

Regression guard: `flutter test test/ios_background_audio_config_test.dart`.
The simulator is not a reliable test surface — verify on a real device before
claiming a fix.

## Supabase Runtime Config

`SUPABASE_URL` and `SUPABASE_ANON_KEY` must be provided with Dart defines for
any configured run. The schema remains a public metadata default:
`SUPABASE_DB_SCHEMA=from_fed_to_chain`.

```sh
flutter run \
  --dart-define=SUPABASE_URL=https://<project-ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon-key>
```

For Xcode-run builds, the Runner target's Flutter build phase reads the same
values from the repo-root `.env` and injects them into `DART_DEFINES` before it
delegates to Flutter's `xcode_backend.sh`. Do not rely on `Runner` scheme >
`Run` > `Arguments` > `Environment Variables`; `String.fromEnvironment` only
sees compile-time `--dart-define` values.

## iOS Versioning (invariants)

- `pubspec.yaml` is the source of truth in `x.y.z+build` format
  (e.g. `version: 2.0.2+14`). Xcode reads it indirectly via
  `ios/Flutter/Generated.xcconfig` → `$(FLUTTER_BUILD_NAME)` /
  `$(FLUTTER_BUILD_NUMBER)`.
- Do not hand-edit `ios/Flutter/Generated.xcconfig` or
  `ios/Flutter/flutter_export_environment.sh`; both are generated and
  gitignored.
- Release prep: `pnpm --filter @zapengine/mobile ios:release:prepare -- <ver>`
  (add `--deep-clean` if Xcode/App Store Connect still sees an old version).

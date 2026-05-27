# iOS Release Runbook

Step-by-step procedures for iOS background-audio configuration and App Store
versioning. The hard invariants live in [../CLAUDE.md](../CLAUDE.md); this
file is the procedural companion.

## Background audio: which plists Xcode actually uses

The app target does NOT build from `ios/Runner/Info.plist` for normal
configurations. Xcode uses one of these per build configuration:

- `ios/Runner/Info-Debug.plist`
- `ios/Runner/Info-Profile.plist`
- `ios/Runner/Info-Release.plist`

Each active plist, plus the base `Info.plist`, must include:

```xml
<key>AVAudioSessionCategory</key>
<string>AVAudioSessionCategoryPlayback</string>
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>
```

### Regression guard

```sh
flutter test test/ios_background_audio_config_test.dart
```

### Manual acceptance (real device required)

The simulator is not a reliable test for lock-screen/background audio.

```sh
flutter run --release -d <device-id> \
  --dart-define=SUPABASE_URL=https://<project-ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon-key>
plutil -p build/ios/iphoneos/Runner.app/Info.plist | grep -E 'AVAudioSessionCategory|UIBackgroundModes|audio'
```

Start an episode, press the side button to lock the phone, and confirm audio
continues for at least 30 seconds with lock-screen controls.

For Xcode-run release checks, add the same Supabase values under
`Runner` scheme > `Run` > `Arguments` > `Environment Variables`, or regenerate
Flutter's iOS config with a `flutter build ios ... --dart-define=...` command
before opening the workspace.

## App Store release versioning

Xcode does not read `pubspec.yaml` directly. Flutter writes the version into
`ios/Flutter/Generated.xcconfig`, then Xcode expands these plist values:

```xml
<key>CFBundleShortVersionString</key>
<string>$(FLUTTER_BUILD_NAME)</string>
<key>CFBundleVersion</key>
<string>$(FLUTTER_BUILD_NUMBER)</string>
```

Keep `pubspec.yaml` in `x.y.z+build` format for releases, for example:

```yaml
version: 2.0.2+14
```

### Release prep workflow

Before a manual Xcode upload, run:

```sh
pnpm --filter @zapengine/mobile ios:release:prepare -- 2.0.2+14
```

Then open `ios/Runner.xcworkspace` and archive from Xcode. The shared
`Runner.xcscheme` has an Archive pre-action that runs
`tool/prepare_ios_release.sh --from-xcode`, so Xcode Archive refreshes the
generated Flutter iOS config automatically as a backstop.

If Xcode or App Store Connect still sees an old version, rerun with deep clean:

```sh
pnpm --filter @zapengine/mobile ios:release:prepare --deep-clean -- 2.0.2+14
```

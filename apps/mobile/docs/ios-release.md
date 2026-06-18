# iOS Release Runbook

Step-by-step procedures for iOS background-audio configuration and App Store
versioning. The hard invariants live in [../CLAUDE.md](../CLAUDE.md); this
file is the procedural companion.

## Local iOS build (Flutter 3.44+ / Xcode 26)

The committed iOS project is **CocoaPods-only and un-migrated**. Flutter 3.44+
defaults Swift Package Manager (SPM) to *on*, so a plain `flutter build ios`
auto-runs an "Adding Swift Package Manager integration…" migration. That
migration vends the Flutter framework through SPM instead of the `Flutter`
CocoaPods pod, which strips the `Flutter` module from the CocoaPods plugins'
header search path and breaks the build with:

```
'Flutter/Flutter.h' file not found            (sqflite_darwin)
Unable to resolve module dependency: 'Flutter' (url_launcher_ios, shared_preferences_foundation)
```

**Chosen direction: stay on CocoaPods, disable SPM** (no project-file
migration, so the background-audio / deep-link / versioning invariants are
untouched). Run once per machine:

```sh
flutter config --no-enable-swift-package-manager   # persists to ~/.config/flutter/settings
```

Then build (simulator debug needs no code signing):

```sh
flutter clean && flutter pub get
flutter build ios --simulator --debug
```

Notes:

- **CocoaPods + UTF-8 locale:** a manual `pod install` aborts with
  `Unicode Normalization not appropriate for ASCII-8BIT` in a shell that lacks a
  UTF-8 locale. Export `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` first. `flutter
  build`/`flutter run` set this themselves.
- **Other Flutter 3.44 migrations still fire** on build — minimum-iOS bump to
  13.0 and the UIScene-lifecycle migration (`FlutterSceneDelegate`,
  `UIApplicationSceneManifest`, plugin registration moved to
  `didInitializeImplicitFlutterEngine`). These are *not* what breaks the build
  and they preserve the plist invariants, but they are reverted here to keep the
  un-migrated baseline. They re-apply (harmlessly) on each build until committed.
  Adopting them is a **separate, deliberate change** that must verify
  lock-screen/background audio on a **real device** (the simulator is not a
  reliable surface) before landing — do not fold it into unrelated branches.

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

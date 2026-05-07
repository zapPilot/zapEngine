# Mobile App Notes

## iOS Background Audio

Lock-screen audio depends on both Dart startup order and the native plist that
Xcode actually packages.

- `AudioService.init()` must run in `lib/main.dart` before `runApp()`.
- `PodcastAudioHandler` owns the `AudioPlayer`; do not reintroduce a lazy
  wrapper that creates `AudioService` on first play.
- The handler should publish the `MediaItem` before loading the HLS source, then
  update duration from `durationStream`.
- Do not move background audio into `Runner.entitlements`; iOS reads this from
  the app `Info.plist`.

This project is easy to misconfigure because the app target does not build from
`ios/Runner/Info.plist` for normal configurations. Xcode uses:

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

Regression guard:

```sh
flutter test test/ios_background_audio_config_test.dart
```

Before claiming this is fixed, install on a real iPhone. The simulator is not a
reliable test for lock-screen/background audio:

```sh
flutter run --release -d <device-id>
plutil -p build/ios/iphoneos/Runner.app/Info.plist | grep -E 'AVAudioSessionCategory|UIBackgroundModes|audio'
```

Manual acceptance: start an episode, press the side button to lock the phone,
and confirm audio continues for at least 30 seconds with lock-screen controls.

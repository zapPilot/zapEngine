# Android Studio one-click Zap Pilot run design

## Goal

Make Android Studio's Play action launch Zap Pilot on the local Android emulator
instead of stopping at the Expo Development Build launcher. Preserve Expo,
Fast Refresh, native debugging, and the existing EAS production AAB workflow.

## Root cause

The current Android Studio `app` configuration assembles and launches the debug
APK's default activity. It does not start Metro or pass the Expo development
client a project URL. The debug variant deliberately omits the JavaScript bundle,
so a fresh development client has no app to load and correctly opens its launcher.

`expo run:android` already supplies the missing orchestration: it starts Metro,
boots or selects a device, configures the ADB connection, builds and installs the
debug APK, and opens the development-client URL.

## Design

Keep Expo and `expo-dev-client`. Removing Expo would require replacing Expo
Router and numerous native modules without addressing the underlying requirement
that a debug React Native app needs Metro.

Configure the `expo-dev-client` plugin in `apps/app/app.config.ts` with Android
`launchMode: "most-recent"` and
`defaultLaunchURL: "http://10.0.2.2:8081"`. `10.0.2.2` is the Android Emulator's
alias for the host Mac. This gives the normal Android `app` run configuration a
deterministic fallback whenever Metro is already running. If Metro is unavailable,
the launcher remains the diagnostic fallback rather than hiding the connection
failure.

Create a local Android Studio Shell Script run configuration named
`Zap Pilot (Expo)` with:

```text
Working directory: /Users/chouyasushi/htdocs/zapEngine
Command: pnpm --filter @zapengine/app android -- --device Pixel_8_API_36
```

Make `Zap Pilot (Expo)` the selected toolbar configuration. Pressing Play then
delegates to the repository's existing `android` script, whose implementation is
`expo run:android`. The command is local-machine configuration because the
generated `apps/app/android/` project and its `.idea` state are intentionally
ignored. The repository remains portable; another developer may choose a
different emulator name in their local run configuration.

Retain the generated Android `app` configuration for attaching the Android Studio
debugger and investigating native Gradle/Kotlin issues. It is not the primary
one-click product-launch configuration.

## Development flow

1. Select `Zap Pilot (Expo)` in Android Studio and press Play.
2. Expo CLI starts `Pixel_8_API_36` if necessary and starts or reuses Metro on
   port 8081.
3. Gradle incrementally builds and installs the debug app.
4. Expo CLI opens the project URL in the development client.
5. The emulator renders Zap Pilot and subsequent JavaScript changes use Fast
   Refresh.

If Metro is already running and only native debugging is needed, the original
Android `app` configuration can launch the default activity; the configured
default URL points it at the same Metro server.

## Error handling

- If port 8081 belongs to an incompatible process, the Expo command must surface
  the port conflict instead of silently connecting to it.
- If `Pixel_8_API_36` is missing or cannot boot, Expo must fail visibly in the
  Android Studio Run window. The local configuration can then be updated to an
  installed AVD.
- If Metro cannot be reached from the emulator, the development client may fall
  back to its launcher. This is treated as a failed acceptance check, and Metro,
  ADB, and emulator networking must be inspected before completion.
- Regenerating `apps/app/android/` may erase local `.idea` state. The documented
  command and app-level default URL remain the recovery path; the local Android
  Studio configuration can be recreated without changing application code.

## Production AAB

Keep the existing production paths:

```bash
# EAS cloud
pnpm --filter @zapengine/app android:release

# EAS production build executed on this Mac
pnpm --filter @zapengine/app android:release:local
```

The local command writes
`apps/app/dist/android/zap-pilot-release.aab`. Both production paths use the
`production` EAS profile, store distribution, app-bundle output, remote version
management, and EAS-managed credentials.

Do not upload an AAB assembled directly by the ignored Android Studio project.
That generated project currently has `versionCode 1` and signs its release build
with the debug key. Before uploading any EAS AAB, compare its signer SHA-1 with
Google Play Console's upload certificate. The currently existing local AAB is
signed with SHA-1
`87:6A:29:9D:29:A2:6E:8A:94:F7:AD:79:3D:43:E4:2D:61:8A:0B:F0`; it must not be
uploaded until that fingerprint is confirmed in Play Console.

## Verification

- Extend the app-config unit test to assert the Android development-client launch
  mode and default URL.
- Regenerate the Android project and verify the merged debug manifest contains
  `DEV_CLIENT_DEFAULT_LAUNCHER_URL=http://10.0.2.2:8081`.
- Run the app workspace checks and `pnpm verify changed`.
- With no emulator or Metro process running, select `Zap Pilot (Expo)` and press
  Android Studio Play.
- Confirm `Pixel_8_API_36` boots and displays Zap Pilot application UI, not the
  Expo launcher.
- Stop and relaunch through the same Play action to verify the workflow is
  repeatable.
- Inspect the production AAB rather than uploading it: confirm the package is
  `com.fromfedtochain.app`, a JavaScript bundle is embedded, and the signer
  fingerprint is reported for comparison with Play Console.

## Acceptance criteria

- One Android Studio Play action starts the required local services and displays
  Zap Pilot on `Pixel_8_API_36`.
- JavaScript development retains Metro and Fast Refresh.
- Expo's launcher is visible only as an explicit connection-failure fallback.
- Native Android debugging remains available through the original `app`
  configuration.
- The production AAB commands remain unchanged and no debug-signed Android Studio
  artifact is presented as Play-uploadable.

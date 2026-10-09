# Skia renderer spike

Skia is pinned to 2.6.2. pnpm permits its install script to copy the provider's
prebuilt native libraries into the package. iOS autolinking excludes Skia; both
the native Pod lock guard and the bundle source guard reject an accidental leak.
Web bundles also reject Skia through the native-package leak check.

Run the headless check from the app workspace after installing dependencies:

```sh
node scripts/skia-spike.mjs /tmp/zap-skia-spike.png
```

This uses Skia's CanvasKit adapter, a non-affine 3×3 `concat` matrix, and a
Paragraph loaded from the app's Martian Mono static font. It writes a PNG and
reports the font's glyph IDs for the rule marks. Those marks are missing from
the bundled Mono subset. Android's system fallback produces emoji arrows, so
both renderers draw these marks as vectors.

The matching isolated Android entry is `tests/fixtures/skiaSpike.android.tsx`.
It also imports the story scene's JSON using import attributes so the real
Expo/Metro pipeline verifies that syntax:

```sh
pnpm exec expo export:embed --platform android \
  --entry-file tests/fixtures/skiaSpike.android.tsx \
  --bundle-output /tmp/zap-skia-android.bundle \
  --assets-dest /tmp/zap-skia-assets
```

For a local APK, use this fixture as `react.entryFile` in the ignored generated
Android project, and restore the generated entry after verification. This entry
must never replace the production `entrypoint.js`. On macOS the installed
Homebrew JDK can be selected with `JAVA_HOME`; the macOS Java launcher may not
have registered it. The initial Android build required a larger Gradle Metaspace
than the template's 512MB. The local spike used:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
SENTRY_DISABLE_AUTO_UPLOAD=true \
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a \
  --max-workers=4 --no-daemon \
  '-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1536m'
```

`ios:native:sync` discovers an executable CMake from the Android SDK when CMake
is absent from PATH. An existing PATH entry takes precedence. This lets Hermes
build from source without an ad hoc shell override; the supported source-build
configuration remains unchanged.

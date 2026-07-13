# Android Studio One-Click Zap Pilot Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one Android Studio Play action boot the configured emulator, start Metro, build and install the debug app, and display Zap Pilot instead of the Expo launcher.

**Architecture:** Keep Expo and `expo-dev-client`. Add a deterministic emulator Metro fallback to the Expo config, then create a local Android Studio Shell Script run configuration that delegates orchestration to the existing `expo run:android` package script. Keep Play release builds on the existing EAS production paths and inspect, but do not upload, the current AAB.

**Tech Stack:** Expo SDK 57, React Native 0.86, `expo-dev-client`, Vitest, pnpm/Turbo, Android Studio, Android Emulator/ADB, EAS Build.

## Global Constraints

- Work directly in the current checkout; do not create a git worktree.
- Keep Expo, Expo Router, and `expo-dev-client`; removing them is out of scope.
- Android application ID remains exactly `com.fromfedtochain.app`.
- Android development server remains on port `8081`.
- Android Emulator host alias is exactly `10.0.2.2`.
- The local target AVD is exactly `Pixel_8_API_36`.
- Generated `apps/app/android/` and `apps/app/ios/` stay ignored and untracked.
- Never upload an artifact or alter Google Play/EAS credentials during this plan.
- Never present an Android Studio `bundleRelease` artifact as Play-uploadable.

## File map

- Modify `apps/app/tests/appConfig.test.ts`: protect the Android development-client launch settings with a unit test.
- Modify `apps/app/app.config.ts`: declare the `expo-dev-client` Android launch mode and emulator Metro fallback URL.
- Modify `apps/app/README.md`: document the one-click Android Studio run configuration and recovery workflow.
- Local-only `apps/app/android/.idea/workspace.xml`: Android Studio writes the `Zap Pilot (Expo)` Shell Script run configuration here; do not stage or commit it.
- Inspect `apps/app/android/app/src/main/AndroidManifest.xml` and generated merged manifests: verify Expo prebuild output only; do not hand-edit them.
- Inspect `apps/app/dist/android/zap-pilot-release.aab`: verify package, embedded JavaScript, and signer only; do not upload it.

---

### Task 1: Configure deterministic Android dev-client launch

**Files:**

- Modify: `apps/app/tests/appConfig.test.ts:5-15`
- Modify: `apps/app/app.config.ts:63-77`
- Generated verification only: `apps/app/android/app/src/main/AndroidManifest.xml`

**Interfaces:**

- Consumes: Expo config plugin tuple syntax accepted by `ExpoConfig.plugins`.
- Produces: `expo-dev-client` plugin options with Android `launchMode: 'most-recent'` and `defaultLaunchURL: 'http://10.0.2.2:8081'`.

- [ ] **Step 1: Write the failing config test**

Add this test inside the existing `describe('Android store identity', ...)` block:

```ts
it('launches the Android development client against the emulator Metro server', () => {
  expect(appConfig.plugins).toContainEqual([
    'expo-dev-client',
    {
      android: {
        launchMode: 'most-recent',
        defaultLaunchURL: 'http://10.0.2.2:8081',
      },
    },
  ]);
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
pnpm turbo run test --filter=@zapengine/app
```

Expected: the new test fails because `appConfig.plugins` still contains the string
`'expo-dev-client'`, not the configured tuple. Existing app tests remain green.

- [ ] **Step 3: Implement the minimal Expo config change**

Replace the first plugin entry in `apps/app/app.config.ts` with:

```ts
[
  'expo-dev-client',
  {
    android: {
      launchMode: 'most-recent',
      defaultLaunchURL: 'http://10.0.2.2:8081',
    },
  },
],
```

Keep every other plugin and app identifier unchanged.

- [ ] **Step 4: Run the test and verify the green state**

Run:

```bash
pnpm turbo run test --filter=@zapengine/app
```

Expected: Turbo exits `0` and all `@zapengine/app` Vitest tests pass.

- [ ] **Step 5: Regenerate Android native config**

Run from the repository root:

```bash
pnpm --filter @zapengine/app exec expo prebuild --platform android --no-install
```

Expected: Expo reports that the Android project is synchronized. The ignored
native project remains untracked.

- [ ] **Step 6: Verify generated manifest metadata**

Run:

```bash
rg -n "DEV_CLIENT_DEFAULT_LAUNCHER_URL|10.0.2.2:8081" \
  apps/app/android/app/src/main/AndroidManifest.xml
git status --short
```

Expected: the manifest contains
`DEV_CLIENT_DEFAULT_LAUNCHER_URL` with `http://10.0.2.2:8081`; Git shows only the
two tracked Task 1 files modified.

- [ ] **Step 7: Commit the tested config change**

```bash
git add apps/app/app.config.ts apps/app/tests/appConfig.test.ts
git commit -m "fix(app): launch Android dev client from Metro"
```

Expected: pre-commit passes and the commit contains only the two tracked files.

---

### Task 2: Document and configure Android Studio Play

**Files:**

- Modify: `apps/app/README.md:26-55`
- Local-only: `apps/app/android/.idea/workspace.xml`

**Interfaces:**

- Consumes: package script `android = expo run:android` from `apps/app/package.json`.
- Produces: local Android Studio run configuration `Zap Pilot (Expo)` executing `pnpm --filter @zapengine/app android -- --device Pixel_8_API_36` from the repository root.

- [ ] **Step 1: Add the recovery documentation**

Insert this section after the command block in `apps/app/README.md`:

````markdown
## Android Studio development

For one-click emulator development, create a local Android Studio **Shell
Script** run configuration named `Zap Pilot (Expo)`:

```text
Working directory: repository root (the directory containing package.json)
Command: pnpm --filter @zapengine/app android
```

Select that configuration and press Play. Expo CLI starts Metro, boots or selects
the AVD, incrementally builds and installs the debug app, and opens Zap Pilot in
the development client. The generated `android/.idea` directory is ignored, so
each checkout configures its own absolute path. A local configuration may append
`-- --device Pixel_8_API_36` to select that installed AVD without prompting.

The standard Android `app` configuration remains useful for native debugging. If
Metro is already running on port 8081, its default activity connects through the
configured emulator fallback `http://10.0.2.2:8081`.
````

- [ ] **Step 2: Format and verify the README**

Run:

```bash
pnpm exec prettier --write apps/app/README.md
pnpm --filter @zapengine/app format:check
```

Expected: Prettier exits `0`, and the app format check reports all matched files
formatted.

- [ ] **Step 3: Commit the documentation**

```bash
git add apps/app/README.md
git commit -m "docs(app): document Android Studio Expo run"
```

Expected: pre-commit passes and the commit contains only `apps/app/README.md`.

- [ ] **Step 4: Create the local run configuration through Android Studio**

Use Computer Use in the already-open Android Studio project:

1. Open **Run > Edit Configurations**.
2. Add a **Shell Script** configuration.
3. Set the name to `Zap Pilot (Expo)`.
4. Set the script command to
   `pnpm --filter @zapengine/app android -- --device Pixel_8_API_36`.
5. Set the working directory to `/Users/chouyasushi/htdocs/zapEngine`.
6. Apply the configuration and make it the selected toolbar configuration.

Expected: the toolbar displays `Zap Pilot (Expo)`. No tracked file changes are
created because the generated Android `.idea` directory is ignored.

- [ ] **Step 5: Inspect Android Studio's saved local state**

Run:

```bash
rg -n "Zap Pilot \(Expo\)|Pixel_8_API_36|@zapengine/app android" \
  apps/app/android/.idea
git status --short
```

Expected: Android Studio local state contains the configuration name, AVD, and
command; the Git worktree is clean.

---

### Task 3: Prove one-click launch and preserve AAB safety

**Files:**

- No tracked file changes.
- Runtime verification: Android Studio, `Pixel_8_API_36`, Metro port 8081.
- Artifact inspection: `apps/app/dist/android/zap-pilot-release.aab`.

**Interfaces:**

- Consumes: `Zap Pilot (Expo)` local run configuration and configured Expo dev client.
- Produces: fresh evidence that Android Studio Play renders Zap Pilot, plus a read-only AAB identity/signing report.

- [ ] **Step 1: Establish a cold-start baseline**

Run read-only checks:

```bash
adb devices -l
lsof -nP -iTCP:8081 -sTCP:LISTEN
```

If an emulator or Metro is running, stop it through its owning Android Studio/Run
UI so the one-click workflow is tested from a cold state. Do not delete an AVD or
clear application data.

Expected: no emulator is attached and nothing listens on port 8081 before Play.

- [ ] **Step 2: Launch only through Android Studio Play**

With `Zap Pilot (Expo)` selected, click Android Studio's Play button once through
Computer Use. Do not separately run Expo or Metro from a terminal.

Expected: the Android Studio Run window shows the Expo/Gradle process, Metro begins
listening on 8081, `Pixel_8_API_36` boots, and the app is installed and opened.

- [ ] **Step 3: Verify the foreground activity and visible product UI**

Run:

```bash
adb shell dumpsys activity activities | rg \
  "mResumedActivity|topResumedActivity|com.fromfedtochain.app"
```

Then inspect the emulator through Computer Use.

Expected: the resumed package is `com.fromfedtochain.app`, and the emulator shows
Zap Pilot application UI. The Expo Development Build launcher with a development
server URL field is not visible.

- [ ] **Step 4: Verify repeatability**

Stop the Android Studio `Zap Pilot (Expo)` run process, then click Play once more.

Expected: Metro is reused or restarted without a port conflict, the incremental
native build succeeds, and Zap Pilot becomes visible again without manual launcher
interaction.

- [ ] **Step 5: Run the repository verification hierarchy**

Run:

```bash
pnpm turbo run type-check lint test build --filter=@zapengine/app
pnpm --filter @zapengine/app format:check
pnpm turbo run deadcode dup:check --filter=@zapengine/app
pnpm verify changed
```

Expected: every command exits `0`. If `pnpm verify changed` reports a failure,
read `.ai-verify/result.json` and the named log, fix only errors introduced by this
change, and rerun it.

- [ ] **Step 6: Inspect the existing AAB without uploading it**

Run:

```bash
jarsigner -verify apps/app/dist/android/zap-pilot-release.aab
unzip -l apps/app/dist/android/zap-pilot-release.aab | rg \
  "base/assets/index.android.bundle"
keytool -printcert -jarfile apps/app/dist/android/zap-pilot-release.aab | rg \
  "Owner:|SHA1:|Valid from:"
```

Expected: `jar verified`, an embedded `base/assets/index.android.bundle` entry,
and signer SHA-1
`87:6A:29:9D:29:A2:6E:8A:94:F7:AD:79:3D:43:E4:2D:61:8A:0B:F0`. Report that the
fingerprint still requires comparison with Google Play Console before upload.

- [ ] **Step 7: Confirm final Git state**

Run:

```bash
git status --short
git log -4 --oneline
```

Expected: the worktree is clean, and history contains the design, implementation,
and documentation commits. Do not commit generated Android Studio files.

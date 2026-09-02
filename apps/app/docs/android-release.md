# Android Google Play release

The Expo app updates the existing Google Play application rather than creating a
new listing.

| Setting                           | Value                           |
| --------------------------------- | ------------------------------- |
| App / launcher name               | `Zap Pilot`                     |
| Android package                   | `com.fromfedtochain.app`        |
| User-facing version               | `2.1.0`                         |
| Repo's last Flutter `versionCode` | `204`                           |
| First Expo production build       | `205` if Play still ends at 204 |
| Default submission track          | Closed testing, `alpha` track   |

Do not change the Android package or create a new upload key. Google Play treats
a different package as another app, and updates must be signed with the upload
certificate already registered for this listing.

The track is Closed testing rather than Internal testing because this developer
account must satisfy Google's pre-production requirement: 12 opted-in testers
running a closed test for 14 consecutive days before production access can be
requested. Internal testing does not count toward that requirement.

## Tooling choice

Use EAS CLI for release builds and Play Console for rollout management. Android
Studio remains useful for SDK management, emulators, Logcat, and native Gradle
troubleshooting, but it is not the primary release path.

The package scripts pin EAS CLI, so no global installation is required.

## One-time EAS setup

Run commands from the repository root.

### 1. Sign in and link an EAS project

```bash
pnpm --filter @zapengine/app android:eas:login
pnpm --filter @zapengine/app android:eas:init
```

`android:eas:init` adds the EAS project ID to the Expo config. Commit that project
ID; it is not a secret.

### 2. Configure production build variables

The production profile uses the EAS `production` environment. Add the production
values in the Expo dashboard under the project's environment variables. Mirror
the values used by the production app, including the applicable variables below:

```text
ACCOUNT_API_URL
ANALYTICS_ENGINE_URL
PRIVY_MOBILE_APP_ID
PRIVY_MOBILE_CLIENT_ID
ALCHEMY_API_KEY
MORALIS_API_KEY
PODCAST_API_URL
```

Only configure variables actually used by the selected wallet/data providers.
Do not assume the ignored repository-root `.env` is available on EAS Build.

`PRIVY_MOBILE_CLIENT_ID` must reference a Privy **mobile** app client, not
a web client. Open **Privy Dashboard > App settings > Clients** and register the
native identifiers before testing or releasing:

```text
Allowed Android app identifier: com.fromfedtochain.app
Allowed iOS app identifier:     com.zapengine.zappilot.dev
Allowed URL scheme:             zappilotv2
```

Privy rejects every React Native authentication request when the matching app
client has no allowed app identifier. Keep these values synchronized with
`app.config.ts` whenever the package, bundle identifier, or scheme changes.

### 3. Import the existing Android upload key

The existing keystore is expected at:

```text
~/.android/zap-pilot-upload-20260627.jks
```

Open the EAS credential manager:

```bash
pnpm --filter @zapengine/app android:credentials
```

Select the `production` profile and configure the Android keystore by uploading
the existing file. Use the existing alias (`upload`) and its existing passwords.
Never generate a replacement keystore for this Play listing, and never commit the
keystore or passwords.

After import, compare the certificate fingerprint shown by EAS with the upload
certificate shown in Play Console under **Setup > App integrity**.

### 4. Initialize remote Android versioning

EAS remotely manages and increments `versionCode`. Initialize it with the last
version already uploaded to Google Play:

```bash
pnpm --filter @zapengine/app android:version:init
```

First check the highest `versionCode` currently present in Play Console. Enter
`204` only if it is still the highest value; otherwise enter the higher Play
Console value. A production build will use the next number, and every later
production build will increment automatically.

### 5. Configure EAS Submit

The current submission credential is:

```text
Google Cloud project: allweatherportfolioprotocol (242469050085)
Service account: zap-engine@allweatherportfolioprotocol.iam.gserviceaccount.com
```

Enable the publishing API once:

```bash
gcloud services enable androidpublisher.googleapis.com \
  --project=allweatherportfolioprotocol
```

Then open **Google Play Console > Users and permissions > Invite new users** and
invite the service-account email above. On **App permissions**, select the
existing `com.fromfedtochain.app` app and grant the release permissions
recommended by Expo:

- View app information (read-only)
- Edit and delete draft apps
- Release to production, exclude devices, and use Play App Signing
- Release apps to testing tracks
- Manage testing tracks and edit tester lists
- Manage store presence

Finally, upload the service-account JSON key through the EAS credential manager:

```bash
pnpm --filter @zapengine/app android:credentials
```

Choose **Google Service Account > Upload a Google Service Account Key**. Keep the
JSON key outside the repository.

The old Flutter app has already been uploaded manually to this Google Play
listing, so the Play API's mandatory first-manual-upload requirement is already
satisfied. A `PERMISSION_DENIED` response after enabling the API means the
service account is still missing Play Console app permissions; Google Cloud IAM
roles alone do not grant access to a Play Console app.

## Build and release

Before building, run the app workspace gate:

```bash
pnpm turbo run type-check lint test build --filter=@zapengine/app
pnpm --filter @zapengine/app format:check
pnpm turbo run deadcode dup:check --filter=@zapengine/app
```

Create a signed production AAB on EAS:

```bash
pnpm --filter @zapengine/app android:release
```

`android:release` waits for the build to finish and prints the exact EAS build ID
returned by the same build command. Submission requires that ID explicitly:

```bash
pnpm --filter @zapengine/app android:submit -- <EAS_BUILD_ID>
```

There is intentionally no latest-build lookup. This prevents a newer build from
another terminal, automation, or EAS dashboard session from being submitted by
mistake.

For a local one-command build plus EAS-managed auto-submit, this convenience
command remains available:

```bash
pnpm --filter @zapengine/app android:publish
```

The default submission track remains Closed testing. Promote a tested release to
Open testing or Production from Play Console rather than making the repository
command publish directly to all users.

## CI release

`.github/workflows/release-mobile.yml` drives Android and iOS from one manual
workflow. The iOS-only prerequisites and build-number guard are documented in
[ios-release.md](./ios-release.md).

It needs one repository secret, `EXPO_TOKEN` — an Expo **robot** access token.
The keystore, Play service-account key, App Store Connect key, and production
environment variables remain on EAS.

Trigger it from the repository's **Actions** tab with these inputs:

| Input              | Values / usage                                                      |
| ------------------ | ------------------------------------------------------------------- |
| `platform`         | `android`, `ios`, `both`                                            |
| `mode`             | `build-and-submit`, `build-only`, `submit-only`                     |
| `android_build_id` | Exact EAS Android build ID; required for Android `submit-only`      |
| `ios_build_id`     | Exact EAS iOS build ID; required for iOS `submit-only`              |

Build and submit are separate jobs. Each build job writes the EAS build ID to a
job output, and its submit job consumes that exact value. A failed submission can
therefore be re-run without re-running the successful build job or consuming a
new store version number.

`submit-only` is deliberately deterministic: it never asks EAS for "latest".
Provide the exact build ID that should be retried. When `platform=both`, provide
both IDs.

Two workflow properties remain deliberate:

- **Manual trigger only.** Remote auto-increment consumes a version code on every
  build attempt, including failures, so a push-triggered release would burn store
  version numbers on each merge.
- **One global concurrency slot, never cancelled.** Exact IDs remove the submit
  race, but concurrent production builds would still mutate the same remote
  version counters unpredictably.

A runner timeout does not cancel the EAS build. If the cloud build eventually
finishes, locate that build's exact EAS ID and use `submit-only` rather than
starting another build.

## Testers

The `alpha` track draws its audience from the `internal_testers` email list in
Play Console. Being on the list is not enough: each tester must also opt in with
that same Google account before the build appears in their Play Store.

```text
https://play.google.com/apps/testing/com.fromfedtochain.app
```

The app dashboard reports how many testers have opted in. Only opted-in testers
count toward the 12-tester threshold, and the 14-day window is measured on the
closed test.

## Local AAB fallback

For a local Gradle build through EAS CLI:

```bash
pnpm --filter @zapengine/app android:release:local
```

The artifact is written to:

```text
apps/app/dist/android/zap-pilot-release.aab
```

The local build still uses the EAS-managed signing configuration and requires the
Android SDK/NDK toolchain installed by Android Studio.

## Updating the visible version and store name

EAS auto-increments only the internal Android `versionCode`. For a user-visible
release, update `version` in `apps/app/app.config.ts` before building.

The binary and launcher already use `Zap Pilot`. The Google Play store-listing
title is managed separately: update the app name to **Zap Pilot** in Play Console
under the main store listing for each published language. Changing Expo `name`
does not rename the existing Play listing by itself.

## Failure guide

- **Package mismatch:** the build must use `com.fromfedtochain.app`.
- **Wrong certificate:** re-import the existing upload keystore; do not create a
  new app or silently replace the key.
- **Version code already used:** check EAS remote version state and set it to the
  highest version currently present in Play Console, then rebuild.
- **Runtime config missing:** add the required variable to the EAS `production`
  environment; the local `.env` is not uploaded.
- **Publishing API disabled:** enable `androidpublisher.googleapis.com` in the
  Google Cloud project that owns the service account.
- **Submit permission denied:** invite the service account under Play Console
  **Users and permissions**, select this app, and grant the release permissions
  listed above. Google Cloud project roles are not a substitute.
- **Submission failed after a successful build:** retry only the submit job or
  use `submit-only` with that exact EAS build ID. Do not rebuild just to retry.

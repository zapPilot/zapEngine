# iOS App Store release

The Expo app updates the existing App Store Connect application rather than
creating a new record. The listing already exists because earlier builds were
uploaded manually from Xcode.

| Setting                    | Value                          |
| -------------------------- | ------------------------------ |
| App / launcher name        | `Zap Pilot`                    |
| iOS bundle identifier      | `com.zapengine.zappilot.dev`   |
| User-facing version        | `2.1.0`                        |
| Build number source        | EAS remote, auto-incremented   |
| Default submission outcome | App Store Connect → TestFlight |

Do not change the bundle identifier. App Store Connect treats a different
identifier as a different app, and the existing listing, TestFlight testers, and
Privy mobile client registration are all bound to this one.

## What automation covers, and where it stops

`eas submit` uploads a build to App Store Connect, which makes it available to
TestFlight. It does **not** submit the app for App Store review — that remains a
deliberate action in App Store Connect, followed by Apple's own review, which
typically takes one to three days and can be rejected.

EAS auto-increments only the internal `buildNumber`. For a user-visible release,
update `version` in `apps/app/app.config.ts` before building.

## One-time EAS setup

The EAS project link, the `production` environment variables, and the Privy
native-identifier registration are shared with Android and already documented in
[android-release.md](./android-release.md). Do not repeat them here. The steps
below are the iOS-only additions.

### 1. Give EAS an App Store Connect API key

Interactive Apple sign-in requires two-factor confirmation, which no CI runner
can complete. EAS needs its own credential instead.

In App Store Connect open **Users and Access > Integrations > App Store Connect
API** and create a team key with the **App Manager** role. Download the `.p8`
file — Apple allows this exactly once. Note the Key ID and Issuer ID.

Then upload it to EAS:

```bash
pnpm --filter @zapengine/app ios:credentials
```

Choose the App Store Connect API Key flow and upload the `.p8`. Keep the file
outside the repository; `.gitignore` covers `*.p8`, but the safe place for it is
a password manager, not a working tree.

### 2. Create the distribution certificate and provisioning profile

In the same `ios:credentials` session, let EAS generate a **Distribution
Certificate** and an **App Store** provisioning profile for
`com.zapengine.zappilot.dev`. The `production` profile uses
`credentialsSource: remote`, so a build fails rather than falling back to
anything local when these are missing.

### 3. Record the App Store Connect app ID

A non-interactive submission cannot resolve the target app from the bundle
identifier, so the numeric app ID must be configured explicitly.

Open **App Store Connect > your app > App Information > General Information**
and copy the **Apple ID** — a digits-only value, not the email address you sign
in with. Add it to `apps/app/eas.json`:

```json
{
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "0000000000"
      }
    }
  }
}
```

Until this is set, `ios:submit` fails immediately with that instruction rather
than producing an opaque eas-cli error.

### 4. Initialize remote iOS versioning

This is the step most likely to be skipped, and it fails late and confusingly.
Earlier Xcode uploads already consumed build numbers on App Store Connect, but
EAS remote versioning starts from scratch. Left uninitialized, `autoIncrement`
offers build number 1 and App Store Connect rejects the upload as not higher
than an existing build.

Check the highest build number present in App Store Connect for version `2.1.0`,
then:

```bash
pnpm --filter @zapengine/app ios:version:init
```

Enter that highest existing value. The next production build takes the number
after it, and every later build increments automatically.

## Build and release

Before building, run the app workspace gate:

```bash
pnpm turbo run type-check lint test build --filter=@zapengine/app
pnpm --filter @zapengine/app format:check
pnpm turbo run deadcode dup:check --filter=@zapengine/app
```

Create the signed store build on EAS:

```bash
pnpm --filter @zapengine/app ios:release
```

Upload the latest finished production store build to App Store Connect:

```bash
pnpm --filter @zapengine/app ios:submit
```

The wrapper filters EAS builds by iOS, `production`, `store`, and `finished`,
then submits that exact build ID. Do not replace it with an unfiltered
`eas submit --latest`, which could pick an internal-distribution build.

For the GitHub Actions equivalent, see
[android-release.md](./android-release.md#ci-release) — the same workflow drives
both platforms.

## Xcode fallback

`ios:archive` remains supported for local archiving through Xcode's **Product →
Archive**, and is the path to reach for when EAS itself is the problem. It
requires macOS and a local signing identity. See
[../README.md](../README.md#ios-archive-and-testflight-safety) for the native
dependency guarantees it provides.

## Failure guide

- **Interactive Apple login requested:** the App Store Connect API key is not on
  EAS. Complete step 1; a CI runner cannot answer a two-factor prompt.
- **Missing distribution certificate or provisioning profile:** complete step 2.
  `credentialsSource: remote` has no local fallback.
- **`ascAppId` error from `ios:submit`:** complete step 3. The value is the
  numeric Apple ID of the app, not your Apple account email.
- **Build number not higher than existing build:** remote versioning was never
  aligned with App Store Connect. Complete step 4, then rebuild.
- **Runtime config missing:** add the variable to the EAS `production`
  environment; the local `.env` is not uploaded to EAS Build.
- **Failed build consumed a build number:** expected with remote
  auto-increment. Retry a successful binary with `ios:submit`; do not rebuild
  merely to retry a submission.
- **Build succeeded but nothing appears in TestFlight:** App Store Connect
  processes uploads asynchronously. Check the app's TestFlight tab for a build
  stuck in processing or flagged for missing export-compliance answers.

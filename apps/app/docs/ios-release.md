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
deliberate action in App Store Connect.

EAS auto-increments only the internal `buildNumber`. For a user-visible release,
update `version` in `apps/app/app.config.ts` before building.

## One-time EAS setup

The EAS project link, the `production` environment variables, and the Privy
native-identifier registration are shared with Android and documented in
[android-release.md](./android-release.md). The steps below are iOS-specific.

### 1. Give EAS an App Store Connect API key

Interactive Apple sign-in requires two-factor confirmation, which no CI runner
can complete. EAS needs its own credential instead.

In App Store Connect open **Users and Access > Integrations > App Store Connect
API** and create a team key with the **App Manager** role. Download the `.p8`
file once, then upload it to EAS with:

```bash
pnpm --filter @zapengine/app ios:credentials
```

Keep the `.p8` outside the repository.

### 2. Create the distribution certificate and provisioning profile

In the same `ios:credentials` session, let EAS generate a **Distribution
Certificate** and an **App Store** provisioning profile for
`com.zapengine.zappilot.dev`. The production profile uses remote credentials.

### 3. Record the App Store Connect app ID

A non-interactive submission needs the numeric App Store Connect Apple ID in
`apps/app/eas.json` under `submit.production.ios.ascAppId`.

### 4. Initialize remote iOS versioning

Earlier Xcode uploads consumed build numbers that EAS remote versioning did not
know about. App Store Connect had already reached build `19` for app version
`2.1.0` when the deterministic EAS flow was introduced on 2026-09-02. That
historical lower bound is recorded in `apps/app/release-baselines.json`.

The production workflow runs `ios:version:check` before starting a new iOS build.
If the EAS remote build number is below that floor, CI fails immediately instead
of creating another binary that Apple will reject.

EAS CLI does not expose a supported non-interactive flag for setting the remote
build number, so initial alignment remains a deliberate one-time operation:

```bash
pnpm --filter @zapengine/app ios:version:init
```

Set the remote value to the highest build already present in App Store Connect.
For the 2026-09-02 recovery that value is `19`; the next production build will
auto-increment to `20`.

After EAS becomes the only iOS release path, the baseline does not need to change
for ordinary releases. If an out-of-band Xcode upload later jumps ahead of EAS,
update `release-baselines.json` to the new observed App Store Connect floor and
realign EAS before building again.

## Build and release

Before building, run the app workspace gate:

```bash
pnpm turbo run type-check lint test build --filter=@zapengine/app
pnpm --filter @zapengine/app format:check
pnpm turbo run deadcode dup:check --filter=@zapengine/app
```

Check remote version safety and create the signed store build:

```bash
pnpm --filter @zapengine/app ios:version:check
pnpm --filter @zapengine/app ios:release
```

`ios:release` waits for EAS Build and captures the exact build ID returned by that
same build command. Submission requires that ID explicitly:

```bash
pnpm --filter @zapengine/app ios:submit -- <EAS_BUILD_ID>
```

There is intentionally no latest-build fallback. A release must submit the binary
it just built, or an operator must name the exact existing build during recovery.

## GitHub Actions release

`.github/workflows/release-mobile.yml` splits build and submit into separate jobs.
The build job exposes its EAS build ID as a job output; the submit job consumes
that exact ID. This has two important properties:

- another EAS build cannot steal the submission by becoming "latest" between
  build completion and submission;
- re-running a failed submit job does not re-run the successful build job or burn
  another build number.

For normal releases choose `build-and-submit`. For recovery choose `submit-only`
and provide `ios_build_id` explicitly. Do not re-run an old whole workflow run to
create a fresh release: GitHub reruns use that run's original commit.

## Xcode fallback

`ios:archive` remains supported for local archiving through Xcode when EAS itself
is the problem. Any App Store Connect upload performed outside EAS can advance
the store build number independently, so realign EAS remote versioning before the
next EAS production build.

## Failure guide

- **Interactive Apple login requested:** the App Store Connect API key is not on
  EAS. Complete step 1; CI cannot answer a two-factor prompt.
- **Missing distribution certificate or provisioning profile:** complete step 2.
- **`ascAppId` error:** verify `submit.production.ios.ascAppId` in `eas.json`.
- **`ios:version:check` says EAS is below the ASC floor:** run `ios:version:init`
  once and set EAS to at least the highest build already present in App Store
  Connect; do not keep building through the gap.
- **Build number rejected by Apple despite the preflight:** an out-of-band upload
  advanced App Store Connect beyond the recorded floor. Update the baseline and
  realign EAS before rebuilding.
- **Submission failed after a successful build:** retry only the submit job or use
  `submit-only` with that exact EAS build ID. Do not rebuild just to retry upload.
- **Runtime config missing:** add the variable to the EAS `production`
  environment; the local `.env` is not uploaded to EAS Build.

# iOS App Store release

The Expo app updates the App Store listing the retired Flutter app shipped,
rather than creating a new record. This mirrors Android, which kept
`com.fromfedtochain.app` for the same reason
([android-release.md](./android-release.md)).

| Setting                    | Value                           |
| -------------------------- | ------------------------------- |
| App / launcher name        | `Zap Pilot`                     |
| iOS bundle identifier      | `com.example.fromFedToChainApp` |
| App Store Connect app ID   | `6749248542`                    |
| Apple Team ID              | `LP8CA4MT6U`                    |
| User-facing version        | `3.0.0`                         |
| Build number source        | EAS remote, auto-incremented    |
| Default submission outcome | App Store Connect → TestFlight  |

The `com.example.` prefix is a Flutter scaffold default that reached the App
Store in 2.0.4. App Store Connect cannot change an existing record's bundle
identifier, so this value is permanent for as long as the listing is.

Do not change the bundle identifier. App Store Connect treats a different
identifier as a different app, and the shipped listing, its installed base,
TestFlight testers, the served `apple-app-site-association`
(`apps/podcast-pipeline/src/services/share-page.ts`), and the Privy mobile
client registration are all bound to this one. A second record was created once,
under `com.zapengine.zappilot.dev` (ASC app `6788190113`); Apple rejected it as a
new app under Guideline 4.2.2, and it never shipped. Publishing as an update to
an already-approved listing is the supported path.

## What automation covers, and where it stops

`eas submit` uploads a build to App Store Connect, which makes it available to
TestFlight. It does **not** submit the app for App Store review — that remains a
deliberate action in App Store Connect.

EAS auto-increments only the internal `buildNumber`. For a user-visible release,
update `version` in `apps/app/app.config.ts` before building.

## Version numbering

Apple compares a version string as dot-separated integers, so `2.03` is major 2,
minor 3 — not `2.0.3`. The Flutter app released `2.03`, so every `2.0.x` and
`2.1.x` string is a _downgrade_ and App Store Connect refuses it. That is why the
Expo app releases as `3.0.0`: it clears the shipped version under any reading,
and it is honest about a full rewrite plus rebrand.

`version` is shared with Android, where it is only the display `versionName` and
carries no ordering constraint — Google Play orders by `versionCode`.

Do not "correct" this back down to a 2.x string.

## App Review notes

App Store Connect holds the listing copy; this is the source of truth for the
**App Review Information → Notes** field, because it is the part reviewers read
that depends on facts about this repository.

> This update continues the existing From Fed to Chain podcast experience with an
> updated design and branding.
>
> All podcasts and editorial content available in the app are original
> first-party content produced by us. The app does not aggregate podcasts,
> articles, or media from third-party websites. Every episode is scripted,
> produced, and published by our own team through our own backend.

The second paragraph exists because a separate, never-shipped app record was
rejected under Guideline 4.2.2 as an internet content aggregator. The content is
first-party; the notes say so plainly.

Do not describe wallet, swap, or rebalance functionality here. Those surfaces are
kept out of the iOS build and its bundle (Guideline 3.1.5(b)(i)), enforced by
`scripts/assert-ios-bundle-clean.cjs`.

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
`com.example.fromFedToChainApp`. The production profile uses remote credentials.

### 3. Record the App Store Connect app ID

A non-interactive submission needs the numeric App Store Connect Apple ID in
`apps/app/eas.json` under `submit.production.ios.ascAppId`.

### 4. Initialize remote iOS versioning

Earlier Xcode uploads consumed build numbers that EAS remote versioning did not
know about, and the listing carries the Flutter app's history on top of that.
App Store Connect has reached build `204` on this record, from the final Flutter
release `2.0.4 (204)`. That historical lower bound is recorded in
`apps/app/release-baselines.json`.

`ios:release` runs `ios:version:check` as a preflight before starting a new iOS
build. If the EAS remote build number is below that floor, it fails immediately
instead of creating another binary that Apple will reject. `ios:version:check`
remains available as a standalone diagnostic.

EAS CLI does not expose a supported non-interactive flag for setting the remote
build number, so initial alignment remains a deliberate one-time operation:

```bash
pnpm --filter @zapengine/app ios:version:init
```

Set the remote value to the highest build already present in App Store Connect.
For this listing that value is `204`; the next production build will
auto-increment to `205`, matching how Android numbered its first Expo build.

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

Create the signed store build (runs the remote version preflight first):

```bash
pnpm --filter @zapengine/app ios:release
```

`ios:release` waits for EAS Build and captures the exact build ID returned by that
same build command. The ID is the last path segment of the `See logs:` URL
printed when the build starts — visible in the job log even if the runner
timeouts — and on the Expo dashboard at `expo.dev/accounts/<account>/projects/<project>/builds/<build-id>`.
Submission requires that ID explicitly:

```bash
pnpm --filter @zapengine/app ios:submit <EAS_BUILD_ID>
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

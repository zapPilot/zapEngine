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
| User-facing version        | `3.0.1`                         |
| Build number source        | EAS remote, auto-incremented    |
| Default submission outcome | App Store Connect → TestFlight  |

The `com.example.` prefix comes from the retired Flutter app lineage and is the
bundle identifier of the shipped App Store listing. App Store Connect cannot
change an existing record's bundle identifier, so this value is permanent for
as long as the listing is.

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
Expo app first released as `3.0.0`: it clears the shipped version under any reading,
and it is honest about a full rewrite plus rebrand. `3.0.0` is now approved and
its train is closed for new build submissions (ITMS-90062/90186), so the current
release is `3.0.1` — App Store Connect requires a higher `CFBundleShortVersionString`
than the previously approved version.

`version` is shared with Android, where it is only the display `versionName` and
carries no ordering constraint — Google Play orders by `versionCode`.

Do not "correct" this back down to a 2.x string.

## App Review notes

App Store Connect holds the listing copy; this is the source of truth for the
**App Review Information → Notes** field, because it is the part reviewers read
that depends on facts about this repository.

> This update includes the existing Zap Pilot podcast experience plus a
> read-only portfolio dashboard. Home and Portfolio display existing
> portfolio analytics for the signed-in account or a user-entered watch-only
> address. The iOS dashboard is informational only and cannot move assets or
> execute transactions.
>
> All podcasts and editorial content available in the app are original
> first-party content produced by us. The app does not aggregate podcasts,
> articles, or media from third-party websites. Every episode is scripted,
> produced, and published by our own team through our own backend.

The second paragraph exists because a separate, never-shipped app record was
rejected under Guideline 4.2.2 as an internet content aggregator. The content is
first-party; the notes say so plainly.

Do not describe wallet, swap, or rebalance functionality here. Those execution
surfaces are kept out of the iOS build and its bundle; the iOS product statement
is simply that portfolio analytics are read-only. The binary boundary is enforced
by `scripts/assert-ios-bundle-clean.cjs` using both Hermes marker counts and the
exported source-map module list.

## App Privacy checklist

The read-only dashboard adds account-linked portfolio data to the iOS product.
`app.config.ts` therefore declares `NSPrivacyCollectedDataTypeUserID` and
`NSPrivacyCollectedDataTypeOtherFinancialInfo` in addition to email, all for App
Functionality, linked to the user, and not used for tracking.

Before submitting an update, manually keep **App Store Connect → App Privacy** in
sync with the binary: disclose **User ID** and **Other Financial Info** (portfolio
assets / debts / related financial analytics) as data linked to the user and not
used for tracking. This App Store Connect questionnaire is not repository-managed
and cannot be changed by Expo config.

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
App Store Connect has reached build `204` on this record from Flutter build
`2.0.4 (204)`. That uploaded build-number floor is recorded in
`apps/app/release-baselines.json`; it is distinct from the listing's shipped
version `2.03`.

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

## Capability changes invalidate the provisioning profile

Adding an entitlement to `app.config.ts` changes what Apple must grant through
the App ID. A provisioning profile issued before that change cannot sign the
build, and Xcode only says so at code signing, after the whole archive has
already been produced:

```text
Provisioning profile "... AppStore ..." does not support the Associated Domains capability.
```

Running prebuild again does not help. It regenerates
`ios/ZapPilot/ZapPilot.entitlements`, which is the side that already moved ahead
of Apple.

EAS auto capability signing is meant to own that remote state: it enables every
capability present in the generated entitlements and disables every capability
that is enabled remotely but absent from them. Disabling is why the state broke
here — the App Store profile in the Apple account was issued on 2026-09-12 from
a commit that deliberately declared no `associatedDomains`, so it carries no
Associated Domains grant. Building from an older commit that lacks a capability
disables it again.

**Do not count on a production build to repair it.** `ios:release` runs
`eas build --non-interactive`; on 2026-09-22 that reused the stored 2026-09-12
profile without touching Apple, and the build failed inside `xcodebuild` with
the entitlement error above — the server-side prebuild had written the
entitlement, only the profile was stale. Capability syncing is tied to EAS
issuing a profile, so a build that reuses one syncs nothing. Repair the
credentials first, through the interactive flow.

`ios:archive` refuses to open Xcode when the two disagree. It compares the
generated entitlements against `ios.provisioningProfile.capabilities` in
`release-baselines.json`, which records what the current App Store profile is
known to carry. Like `ascBuildNumberFloor`, that value is an operator
attestation: update it only after the profile has actually been reissued.

To recover after adding or removing a capability:

1. Enable the capability on the App ID first, in the Apple Developer portal
   under **Certificates, Identifiers & Profiles → Identifiers →
   `com.example.fromFedToChainApp`**. A profile issued while the App ID lacks
   the capability carries no grant, whoever issues it. Doing this by hand also
   survives an App Store Connect API key that is not allowed to edit
   identifiers, which auto capability signing needs.

2. Have EAS issue a replacement profile, interactively:

   ```bash
   pnpm --filter @zapengine/app ios:credentials
   ```

   Choose the `production` build profile, then **Build Credentials → Provisioning
   Profile**: delete the stale profile and set up a new one, rather than
   accepting the existing one. Keep the existing Distribution Certificate — the
   profile is the stale part, and rotating the certificate invalidates every
   other profile signed against it.

3. Verify the reissued profile rather than trusting that it was regenerated.
   Xcode's distribution step lists App Store profiles from the Apple account,
   not only the ones cached under
   `~/Library/Developer/Xcode/UserData/Provisioning Profiles`, so a superseded
   profile stays selectable until it is removed remotely. Decode the profile
   Xcode selects and read its entitlements:

   ```bash
   security cms -D -i profile.mobileprovision | plutil -extract Entitlements xml1 -o - -
   ```

4. Record the verified capability set in `release-baselines.json` under
   `ios.provisioningProfile`, with the date it was observed, and commit it.

5. Re-run the supported flow and confirm the archive gets past code signing:

   ```bash
   pnpm --filter @zapengine/app ios:native:sync
   pnpm --filter @zapengine/app ios:archive
   ```

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
- **`Provisioning profile ... does not support the ... capability`:** a
  capability was added after the profile was issued. Follow
  [Capability changes invalidate the provisioning
  profile](#capability-changes-invalidate-the-provisioning-profile); do not
  rotate the distribution certificate for it, and do not retry the build
  expecting EAS to repair the profile on its own.
- **`ios:archive` stops at the signing preflight:** the generated entitlements
  declare a capability that `release-baselines.json` does not record on the
  profile. Same section; the baseline is updated last, after the profile is
  verified.
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

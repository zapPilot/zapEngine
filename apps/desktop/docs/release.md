# macOS releases

The first release is `desktop-v0.2.0`. GitHub Latest is reserved for desktop.
Only Apple Silicon is supported. Package version is the sole desktop version source.

## One-time setup

An Apple Account Holder creates a Developer ID Application certificate for team
`LP8CA4MT6U` and exports its private key as a password-protected p12. Create an
App Store Connect API key with Developer permission. If the certificate belongs
to another team, change `mac.identity` in electron-builder.yml; verification reads it.
A change of signing team cannot be bridged by automatic updates.

Create GitHub Environment `desktop-release`, allowing main and desktop-v\* tags.
Configure MAC_CSC_LINK (base64 p12), MAC_CSC_KEY_PASSWORD, APPLE_API_KEY_P8,
APPLE_API_KEY_ID and APPLE_API_ISSUER. Keep these outside Infisical.

## Local builds

Import Developer ID Application into the login keychain, or provide CSC_LINK and
CSC_KEY_PASSWORD. Store notarization credentials with
`xcrun notarytool store-credentials zap-pilot` and set
`APPLE_KEYCHAIN_PROFILE=zap-pilot`. Alternatively set APPLE_API_KEY to a readable
p8 path plus APPLE_API_KEY_ID and APPLE_API_ISSUER.

Run `pnpm desktop:release`; `pnpm desktop:mac` also opens the verified app.
Run `pnpm desktop:package` for an unsigned validation package.
All electron-builder calls use `--publish never`; publication is a separate job.

## Rollout

1. Merge, then dispatch Desktop release on main for a build-only dry run.
2. Tag the main commit `desktop-v0.2.0`; the workflow checks ancestry and version.
3. Download the DMG with quarantine, install into Applications and confirm Gatekeeper acceptance.
4. Publish 0.2.1 and test Download → Restart and Update from 0.2.0.
5. Enable DOWNLOAD_AVAILABILITY.mac in a follow-up PR. Enable Google Play after production listing availability.

Verification checks five assets, update metadata hashes, Developer ID authority,
team, hardened runtime, entitlements, stapling and Gatekeeper on the app and the
apps extracted from zip and DMG. Disabled Gatekeeper assessment leaves verification
incomplete. DMGs themselves are neither signed nor assessed.

## Rollback

Set the previous desktop release back to Latest, or delete the broken release.
Installed newer apps will not downgrade automatically; publish a higher fixed
version for those users. Do not reuse an already published tag.

## Operator acceptance still required

Developer ID signing, notarization, stapling, GitHub publication, quarantine
installation, an actual GitHub update, and Play-installed device detection require
release credentials or store distribution. Apple Development smoke tests cannot
prove those properties.

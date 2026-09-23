import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Apple grants these entitlements through the App ID, so a provisioning profile
// issued before the app declared one of them cannot sign the build. Xcode only
// says so at the end of an archive, after the whole build has already run.
const CAPABILITY_KEY = /^(?:com\.apple\.developer\..+|aps-environment)$/u;
const PLIST_KEY = /<key>([^<]*)<\/key>/gu;

export function readDeclaredCapabilities(entitlementsPlist) {
  const declared = new Set();

  for (const [, rawKey] of entitlementsPlist.matchAll(PLIST_KEY)) {
    const key = rawKey.trim();
    if (CAPABILITY_KEY.test(key)) declared.add(key);
  }

  return [...declared].sort();
}

export function diffSignedCapabilities(declared, signed) {
  const signedKeys = new Set(signed);
  const declaredKeys = new Set(declared);

  return {
    unsigned: declared.filter((key) => !signedKeys.has(key)),
    retired: signed.filter((key) => !declaredKeys.has(key)),
  };
}

function failureMessage(unsigned) {
  return [
    'iOS signing preflight failed: this build declares capabilities the App Store',
    'provisioning profile is not recorded as carrying.',
    ...unsigned.map((key) => `  - ${key}`),
    '',
    'Adding a capability invalidates the existing profile, and Xcode reports it',
    'only at code signing: "Provisioning profile ... does not support the ...',
    'capability". Running prebuild again cannot fix it — the generated',
    'entitlements are the side that moved ahead of Apple.',
    '',
    'Regenerate the credentials first, then record the profile’s new capability',
    'set in apps/app/release-baselines.json under ios.provisioningProfile.',
    'The procedure is in apps/app/docs/ios-release.md, section "Capability changes',
    'invalidate the provisioning profile".',
    '',
  ].join('\n');
}

export function assertIosSignedCapabilities(appRoot) {
  // The generated entitlements file is what Xcode signs against; app.config.ts
  // only reaches Apple through it.
  const entitlementsPath = join(
    appRoot,
    'ios',
    'ZapPilot',
    'ZapPilot.entitlements',
  );
  const declared = existsSync(entitlementsPath)
    ? readDeclaredCapabilities(readFileSync(entitlementsPath, 'utf8'))
    : [];

  const baselines = JSON.parse(
    readFileSync(join(appRoot, 'release-baselines.json'), 'utf8'),
  );
  const signed = baselines.ios?.provisioningProfile?.capabilities;

  if (
    !Array.isArray(signed) ||
    signed.some((key) => typeof key !== 'string' || key.trim() === '')
  ) {
    throw new Error(
      'release-baselines.json has no valid ios.provisioningProfile.capabilities list.',
    );
  }

  const { unsigned, retired } = diffSignedCapabilities(declared, signed);

  if (unsigned.length > 0) throw new Error(failureMessage(unsigned));

  if (retired.length > 0) {
    console.warn(
      `The recorded App Store profile still carries ${retired.join(', ')}, ` +
        'which this build no longer declares. EAS auto capability signing will ' +
        'disable it on the next EAS build; update release-baselines.json then.',
    );
  }

  console.log(
    declared.length > 0
      ? `iOS signing preflight passed: the recorded App Store profile carries ${declared.join(', ')}.`
      : 'iOS signing preflight passed: this build declares no App ID capabilities.',
  );
}

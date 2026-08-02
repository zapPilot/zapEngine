import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runEas } from './eas.mjs';

const PLATFORMS = ['android', 'ios'];
const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function readSubmitProfile(platform) {
  const easJson = JSON.parse(
    readFileSync(path.join(APP_ROOT, 'eas.json'), 'utf8'),
  );

  return easJson.submit?.production?.[platform];
}

function assertSubmitConfigured(platform) {
  const profile = readSubmitProfile(platform);

  if (!profile) {
    throw new Error(
      `eas.json has no submit.production.${platform} profile. ` +
        `See apps/app/docs/${platform}-release.md.`,
    );
  }

  // A non-interactive submission cannot resolve the App Store Connect app from
  // the bundle identifier, so a missing ascAppId surfaces deep inside eas-cli
  // rather than as the configuration error it is.
  if (platform === 'ios' && !/^\d+$/u.test(profile.ascAppId ?? '')) {
    throw new Error(
      'submit.production.ios.ascAppId must be the numeric App Store Connect ' +
        'Apple ID from App Store Connect > App Information > General ' +
        'Information. Add it to apps/app/eas.json; see ' +
        'apps/app/docs/ios-release.md.',
    );
  }
}

function main() {
  const platform = process.argv[2];

  if (!PLATFORMS.includes(platform)) {
    throw new Error(
      `Expected a platform argument (${PLATFORMS.join(' | ')}), got ${
        platform ?? 'nothing'
      }.`,
    );
  }

  assertSubmitConfigured(platform);

  // Filtering to production/store/finished is deliberate: an unfiltered
  // `eas submit --latest` could pick a newer internal-distribution build, which
  // the store would then fully shadow behind the existing production binary.
  const output = runEas(
    [
      'build:list',
      '--platform',
      platform,
      '--build-profile',
      'production',
      '--distribution',
      'store',
      '--status',
      'finished',
      '--limit',
      '1',
      '--json',
      '--non-interactive',
    ],
    { captureStdout: true },
  );

  const builds = JSON.parse(output);
  const build = Array.isArray(builds) ? builds[0] : undefined;

  if (!build?.id) {
    throw new Error(
      `No finished production ${platform} store build was found.`,
    );
  }

  const buildVersion = build.appBuildVersion ?? 'unknown';
  console.log(
    `Submitting production ${platform} build ${build.id} (build version ${buildVersion}).`,
  );

  runEas([
    'submit',
    '--platform',
    platform,
    '--profile',
    'production',
    '--id',
    build.id,
    '--non-interactive',
  ]);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Submission failed: ${message}`);
  process.exit(1);
}

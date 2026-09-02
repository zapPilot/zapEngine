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
    throw new Error(`eas.json has no submit.production.${platform} profile.`);
  }

  if (platform === 'ios' && !/^\d+$/u.test(profile.ascAppId ?? '')) {
    throw new Error(
      'submit.production.ios.ascAppId must be a numeric App Store Connect Apple ID.',
    );
  }
}

function assertBuildIsSubmittable(platform, buildId) {
  const output = runEas(['build:view', buildId, '--json'], {
    captureStdout: true,
    addNonInteractive: false,
  });
  const build = JSON.parse(output);
  const checks = [
    ['id', build.id, buildId],
    ['platform', String(build.platform ?? '').toLowerCase(), platform],
    ['build profile', build.buildProfile, 'production'],
    ['distribution', String(build.distribution ?? '').toLowerCase(), 'store'],
    ['status', String(build.status ?? '').toLowerCase(), 'finished'],
  ];
  const failed = checks.find(([, actual, expected]) => actual !== expected);

  if (failed) {
    const [label, actual, expected] = failed;
    throw new Error(
      `EAS build ${buildId} has ${label} ${String(actual)}, expected ${String(expected)}.`,
    );
  }
}

function main() {
  const platform = process.argv[2];
  const buildId = process.argv[3];

  if (!PLATFORMS.includes(platform)) {
    throw new Error(
      `Expected a platform argument (${PLATFORMS.join(' | ')}).`,
    );
  }

  if (!buildId) {
    throw new Error(
      'An exact EAS build ID is required; latest-build lookup is intentionally unsupported.',
    );
  }

  assertSubmitConfigured(platform);
  assertBuildIsSubmittable(platform, buildId);
  console.log(`Submitting production ${platform} build ${buildId}.`);
  runEas([
    'submit',
    '--platform',
    platform,
    '--profile',
    'production',
    '--id',
    buildId,
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

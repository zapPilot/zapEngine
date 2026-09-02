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

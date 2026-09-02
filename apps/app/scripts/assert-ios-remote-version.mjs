import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runEasJson } from './eas.mjs';

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function main() {
  const baselines = JSON.parse(
    readFileSync(path.join(APP_ROOT, 'release-baselines.json'), 'utf8'),
  );
  const floor = Number(baselines.ios?.ascBuildNumberFloor);
  const appVersion = baselines.ios?.appVersion ?? 'unknown';

  if (!Number.isSafeInteger(floor) || floor < 1) {
    throw new Error(
      'release-baselines.json has no valid ios.ascBuildNumberFloor.',
    );
  }

  const remotePayload = runEasJson([
    'build:version:get',
    '--platform',
    'ios',
    '--profile',
    'production',
    '--json',
    '--non-interactive',
  ]);
  const rawBuildNumber = remotePayload.buildNumber;

  if (rawBuildNumber == null || String(rawBuildNumber).trim() === '') {
    throw new Error(
      'EAS remote iOS build number is not initialized (buildNumber is missing). ' +
        'Run ios:version:init once and set the remote value to at least ' +
        `${floor} before retrying.`,
    );
  }

  const remote = Number(rawBuildNumber);

  if (!Number.isSafeInteger(remote) || remote < 1) {
    throw new Error(
      `EAS did not return a valid remote iOS build number: ${String(rawBuildNumber)}.`,
    );
  }

  if (remote < floor) {
    throw new Error(
      `EAS remote iOS build number ${remote} is below App Store Connect floor ${floor} ` +
        `for app version ${appVersion}. Refusing to burn another invalid build number. ` +
        `Run ios:version:init once and set the remote value to at least ${floor} before retrying.`,
    );
  }

  console.log(
    `iOS version preflight passed: EAS remote ${remote} >= ASC floor ${floor} for ${appVersion}.`,
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`iOS version preflight failed: ${message}`);
  process.exit(1);
}

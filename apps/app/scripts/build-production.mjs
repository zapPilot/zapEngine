import { appendFileSync } from 'node:fs';

import { runEasJson } from './eas.mjs';

const PLATFORMS = ['android', 'ios'];

function resolveBuild(payload) {
  // eas-cli 20.5.1 `eas build --json` prints `printJsonOnlyOutput(builds)`:
  // always an array of BuildFragment|null.
  if (!Array.isArray(payload)) {
    throw new Error('EAS build output was not an array.');
  }

  return payload.find((candidate) => candidate?.id);
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

  const builds = runEasJson([
    'build',
    '--platform',
    platform,
    '--profile',
    'production',
    '--json',
    '--non-interactive',
  ]);
  const build = resolveBuild(builds);

  if (!build?.id) {
    throw new Error(
      `EAS build completed without returning a production ${platform} build ID.`,
    );
  }

  if (String(build.status ?? '').toLowerCase() !== 'finished') {
    throw new Error(
      `EAS build ${build.id} has status ${String(build.status)}, expected FINISHED.`,
    );
  }

  const buildVersion = build.appBuildVersion ?? 'unknown';
  console.log(
    `Built production ${platform} build ${build.id} (build version ${buildVersion}).`,
  );

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `build_id=${build.id}\n`, 'utf8');
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Production build failed: ${message}`);
  process.exit(1);
}

import { appendFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runEasJson } from './eas.mjs';

const PLATFORMS = ['android', 'ios'];

function resolveBuild(payload) {
  // eas-cli 24.3.0 `eas build --json` prints `printJsonOnlyOutput(builds)`:
  // always an array of BuildFragment|null.
  if (!Array.isArray(payload)) {
    throw new Error('EAS build output was not an array.');
  }

  return payload.find((candidate) => candidate?.id);
}

/**
 * Runs one production EAS build and returns the finished build. Does not write
 * `GITHUB_OUTPUT`; the caller decides when the build is safe to hand to submit.
 */
export function runProductionBuild(platform, { message } = {}) {
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
    ...(message ? ['--message', message] : []),
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

  return build;
}

function main() {
  const platform = process.argv[2];

  if (platform === 'ios') {
    throw new Error(
      'iOS production builds must go through `pnpm --filter @zapengine/app ios:release`, ' +
        'which resolves the App Version against App Store Connect first.',
    );
  }

  const build = runProductionBuild(platform);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `build_id=${build.id}\n`, 'utf8');
  }
}

// Compare real paths so a symlinked checkout or temp dir (macOS /var ->
// /private/var) does not make the CLI silently do nothing.
function isEntryPoint() {
  return (
    process.argv[1] !== undefined &&
    realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
  );
}

if (isEntryPoint()) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Production build failed: ${message}`);
    process.exit(1);
  }
}

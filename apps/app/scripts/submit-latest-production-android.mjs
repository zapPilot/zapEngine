import { spawnSync } from 'node:child_process';

const easCommand = ['dlx', 'eas-cli@20.5.1'];

function runEas(args, { captureStdout = false } = {}) {
  const result = spawnSync('pnpm', [...easCommand, ...args], {
    encoding: 'utf8',
    stdio: captureStdout ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? '';
}

function main() {
  const output = runEas(
    [
      'build:list',
      '--platform',
      'android',
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
    throw new Error('No finished production Android store build was found.');
  }

  const versionCode = build.appBuildVersion ?? 'unknown';
  console.log(
    `Submitting production Android build ${build.id} (versionCode ${versionCode}).`,
  );

  runEas([
    'submit',
    '--platform',
    'android',
    '--profile',
    'production',
    '--id',
    build.id,
  ]);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Android submission failed: ${message}`);
  process.exit(1);
}

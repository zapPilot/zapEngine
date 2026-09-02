import { appendFileSync } from 'node:fs';

import { runEas } from './eas.mjs';

const PLATFORMS = ['android', 'ios'];

function resolveBuild(payload) {
  if (Array.isArray(payload)) {
    return payload.find((candidate) => candidate?.id);
  }

  if (Array.isArray(payload?.builds)) {
    return payload.builds.find((candidate) => candidate?.id);
  }

  return payload?.id ? payload : undefined;
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

  const output = runEas(
    [
      'build',
      '--platform',
      platform,
      '--profile',
      'production',
      '--json',
      '--non-interactive',
    ],
    { captureStdout: true },
  );
  const build = resolveBuild(JSON.parse(output));

  if (!build?.id) {
    throw new Error(
      `EAS build completed without returning a production ${platform} build ID.`,
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

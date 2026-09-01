import { readFile } from 'node:fs/promises';

const VERCEL_CONFIGS = [
  'apps/app/vercel.json',
  'apps/control-center/vercel.json',
  'apps/landing-page/vercel.json',
];

const MAIN_ONLY_IGNORE_COMMAND =
  'if [ -n "$VERCEL_GIT_COMMIT_REF" ] && [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then exit 0; fi; exit 1';

let failed = false;

for (const path of VERCEL_CONFIGS) {
  const config = JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

  if (config.ignoreCommand !== MAIN_ONLY_IGNORE_COMMAND) {
    console.error(
      `${path}: Vercel Git builds must skip every non-main branch via ignoreCommand`,
    );
    failed = true;
  }

  if (config.git?.deploymentEnabled !== undefined) {
    console.error(
      `${path}: do not use git.deploymentEnabled as a main-only allowlist; unspecified branches default to enabled`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('Vercel deploy policy: main-only Git builds');

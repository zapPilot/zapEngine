import { readFile } from 'node:fs/promises';

const VERCEL_CONFIGS = [
  'apps/app/vercel.json',
  'apps/control-center/vercel.json',
  'apps/landing-page/vercel.json',
];

let failed = false;

for (const path of VERCEL_CONFIGS) {
  const config = JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

  if (config.git?.deploymentEnabled !== false) {
    console.error(
      `${path}: automatic Git deployments must stay disabled; production deploys run from the main-only workflow`,
    );
    failed = true;
  }

  if (config.ignoreCommand !== undefined) {
    console.error(
      `${path}: ignoreCommand is not the deployment gate; Git auto-deploys must be disabled before Vercel creates a build`,
    );
    failed = true;
  }
}

const workflow = await readFile(
  new URL('../.github/workflows/deploy-vercel.yml', import.meta.url),
  'utf8',
);
for (const required of [
  'workflows: [CI]',
  "github.event.workflow_run.event == 'push'",
  "github.event.workflow_run.head_branch == 'main'",
  'node scripts/deploy-vercel-main.mjs',
]) {
  if (!workflow.includes(required)) {
    console.error(`deploy-vercel.yml: missing main-only deployment guard: ${required}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('Vercel deploy policy: Git auto-deploys disabled; production deploys after main CI');

import { readFile } from 'node:fs/promises';

import { OVERALL_TIMEOUT_MS } from './deploy-vercel-main.mjs';

const VERCEL_CONFIGS = [
  'apps/app/vercel.json',
  'apps/control-center/vercel.json',
  'apps/landing-page/vercel.json',
];
// Checkout and the helper's last status poll run inside the same job budget.
const JOB_SETUP_HEADROOM_MINUTES = 5;

let failed = false;
const fail = (message) => {
  console.error(message);
  failed = true;
};

for (const path of VERCEL_CONFIGS) {
  const config = JSON.parse(
    await readFile(new URL(`../${path}`, import.meta.url), 'utf8'),
  );

  if (config.git?.deploymentEnabled !== false) {
    fail(
      `${path}: automatic Git deployments must stay disabled; production deploys run from the main-only workflow`,
    );
  }

  if (config.ignoreCommand !== undefined) {
    fail(
      `${path}: ignoreCommand is not the deployment gate; Git auto-deploys must be disabled before Vercel creates a build`,
    );
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
    fail(`deploy-vercel.yml: missing main-only deployment guard: ${required}`);
  }
}

if (/^concurrency:/m.test(workflow)) {
  fail(
    'deploy-vercel.yml: concurrency must live on the deploy job; at workflow level the skipped runs from red CI cancel or displace pending green deploys',
  );
}
if (
  !/^ {4}concurrency:\n {6}group: [\w-]+\n {6}cancel-in-progress: false$/m.test(
    workflow,
  ) ||
  workflow.includes('cancel-in-progress: true')
) {
  fail(
    'deploy-vercel.yml: the deploy job needs its own concurrency group with cancel-in-progress: false; a cancelled deploy leaves its Vercel builds occupying the build slot',
  );
}

const minimumJobMinutes =
  Math.ceil(OVERALL_TIMEOUT_MS / 60_000) + JOB_SETUP_HEADROOM_MINUTES;
const jobTimeout = workflow.match(/^ {4}timeout-minutes: (\d+)$/m);
if (!jobTimeout || Number(jobTimeout[1]) < minimumJobMinutes) {
  fail(
    `deploy-vercel.yml: the deploy job needs timeout-minutes >= ${minimumJobMinutes} so GitHub never kills it before scripts/deploy-vercel-main.mjs reports the deployment state`,
  );
}

if (failed) process.exit(1);
console.log(
  'Vercel deploy policy: Git auto-deploys disabled; production deploys after main CI, one at a time and never cancelled',
);

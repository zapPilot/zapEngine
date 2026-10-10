import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PODCAST_PIPELINE_PREREQUISITE } from './ops-lib.mjs';

// These run the real launcher with `pnpm` replaced by a shim that records each
// call and exits with a configured code. Nothing here runs Turbo or starts a
// daemon, so a regression fails the test instead of publishing anything.
const OPS = fileURLToPath(new URL('./ops.mjs', import.meta.url));
const BUILD =
  'turbo run build --filter=@zapengine/podcast-pipeline^... --ui=stream --output-logs=new-only';
const SOCIAL_ONCE = '--filter @zapengine/podcast-pipeline social:once';
const SOCIAL = '--filter @zapengine/podcast-pipeline social:daemon';
const DASHBOARD = 'run ops:dashboard:raw';

const SHIM = [
  '#!/bin/sh',
  'echo "$*" >> "$OPS_TEST_LOG"',
  'if [ "$1" = turbo ]; then exit "$OPS_TEST_TURBO_EXIT"; fi',
  'exit 0',
  '',
].join('\n');

function runOps(args, { turboExit = 0 } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ops-test-'));
  try {
    const shim = path.join(dir, 'pnpm');
    writeFileSync(shim, SHIM);
    chmodSync(shim, 0o755);
    const log = path.join(dir, 'calls.log');
    const result = spawnSync(process.execPath, [OPS, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}${path.delimiter}${process.env.PATH}`,
        OPS_TEST_LOG: log,
        OPS_TEST_TURBO_EXIT: String(turboExit),
      },
    });
    const calls = existsSync(log)
      ? readFileSync(log, 'utf8').trim().split('\n')
      : [];
    return { status: result.status, stderr: result.stderr, calls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('social waits for the dependency build, then starts the daemon', () => {
  const run = runOps(['--social-once']);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.calls, [BUILD, SOCIAL_ONCE]);
});

test('a failed dependency build keeps the daemon from starting', () => {
  const run = runOps(['--social-once'], { turboExit: 1 });
  assert.equal(run.status, 1);
  assert.deepEqual(run.calls, [BUILD]);
  assert.match(run.stderr, /\[social-once\] not started/);
});

test('with a dashboard too, the daemon still starts only after the build', () => {
  const run = runOps(['--dashboard', '--social']);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.calls.filter((call) => call === BUILD).length, 1);
  assert.ok(run.calls.indexOf(BUILD) < run.calls.indexOf(SOCIAL));
  assert.ok(run.calls.includes(DASHBOARD));
});

test('a failed build leaves the dashboard up and the daemon down', () => {
  const run = runOps(['--dashboard', '--social'], { turboExit: 1 });
  assert.equal(run.status, 1);
  assert.ok(run.calls.includes(DASHBOARD));
  assert.ok(!run.calls.includes(SOCIAL));
});

test('the dashboard alone never builds', () => {
  const run = runOps(['--dashboard']);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(!run.calls.some((call) => call.startsWith('turbo ')));
});

test('status never builds', () => {
  const run = runOps(['--status']);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(!run.calls.some((call) => call.startsWith('turbo ')));
});

test('podcast-pipeline dev scripts build the same dependencies the launcher does', () => {
  const { scripts } = JSON.parse(
    readFileSync(
      new URL('../apps/podcast-pipeline/package.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(
    scripts.predev,
    `pnpm -w ${PODCAST_PIPELINE_PREREQUISITE.args.join(' ')}`,
  );
  assert.equal(scripts['predev:worker'], 'pnpm run predev');
  assert.equal(scripts.dev, 'tsx watch src/index.ts');
  assert.equal(scripts['dev:worker'], 'tsx watch src/worker.ts');
});

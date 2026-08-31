import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ENV_DESTINATIONS } from '../../config/env.destinations.mjs';
import {
  buildFlyDeployArgs,
  isDepotInfrastructureFailure,
} from '../fly-deploy.mjs';
import { importFlyValues, listVercelKeys } from './remote.mjs';

const VERCEL_DESTINATIONS = Object.entries(ENV_DESTINATIONS).filter(
  ([, destination]) => destination.platform === 'vercel',
);

// A stub on PATH is the only way to observe the argv and env `remote.mjs` hands
// the real CLI, and the argv is exactly what broke: a `vercel link` option was
// passed as a global flag, so every `env` call parsed as `deploy` instead.
function stubVercel({ stdout = '[]', stderr = '', status = 0 }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'env-remote-'));
  const argvLog = path.join(dir, 'argv');
  const envLog = path.join(dir, 'env');
  writeFileSync(
    path.join(dir, 'vercel'),
    [
      '#!/bin/sh',
      `printf '%s\\n' "$@" > ${JSON.stringify(argvLog)}`,
      `printf '%s\\n' "$VERCEL_ORG_ID" "$VERCEL_PROJECT_ID" > ${JSON.stringify(envLog)}`,
      `printf '%s' ${JSON.stringify(stderr)} >&2`,
      `printf '%s' ${JSON.stringify(stdout)}`,
      `exit ${status}`,
    ].join('\n'),
    { mode: 0o755 },
  );
  process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
  process.env.VERCEL_TOKEN = 'stub-token';
  return {
    argv: async () => (await readFile(argvLog, 'utf8')).trim().split('\n'),
    linkEnv: async () => (await readFile(envLog, 'utf8')).split('\n'),
  };
}

function stubFlyctl() {
  const dir = mkdtempSync(path.join(tmpdir(), 'env-fly-'));
  const argvLog = path.join(dir, 'argv');
  const stdinLog = path.join(dir, 'stdin');
  writeFileSync(
    path.join(dir, 'flyctl'),
    [
      '#!/bin/sh',
      `printf '%s\\n' "$@" > ${JSON.stringify(argvLog)}`,
      `cat > ${JSON.stringify(stdinLog)}`,
    ].join('\n'),
    { mode: 0o755 },
  );
  process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
  return {
    argv: async () => (await readFile(argvLog, 'utf8')).trim().split('\n'),
    stdin: async () => await readFile(stdinLog, 'utf8'),
  };
}

test('vercel is invoked with env ls as the subcommand, not a global flag', async () => {
  const stub = stubVercel({});
  listVercelKeys(ENV_DESTINATIONS.web);
  assert.deepEqual((await stub.argv()).slice(0, 3), [
    'env',
    'ls',
    'production',
  ]);
});

for (const [name, destination] of VERCEL_DESTINATIONS) {
  test(`${name} links through both VERCEL_ORG_ID and VERCEL_PROJECT_ID`, async () => {
    const stub = stubVercel({});
    listVercelKeys(destination);
    const [orgId, projectRef] = await stub.linkEnv();
    // The CLI refuses a run that sets one without the other, and it resolves
    // the reference through /v9/projects/{idOrName}, so a name is enough.
    assert.equal(orgId, destination.orgId);
    assert.equal(projectRef, destination.projectId ?? destination.project);
  });
}

test('a failing CLI reports its own stderr and exit code', () => {
  stubVercel({ status: 1, stderr: 'Error: Project not found' });
  assert.throws(
    () => listVercelKeys(ENV_DESTINATIONS['control-center-vercel']),
    {
      message: /vercel exited 1: Error: Project not found/u,
    },
  );
});

test('Fly env reconciliation can stage secrets without starting a rollout', async () => {
  const stub = stubFlyctl();
  const destination = ENV_DESTINATIONS['podcast-pipeline'];
  importFlyValues(destination, { TEST_SECRET: 'value' }, { stage: true });

  assert.deepEqual(await stub.argv(), [
    'secrets',
    'import',
    '--app',
    destination.app,
    '--stage',
  ]);
  assert.equal(await stub.stdin(), 'TEST_SECRET=value\n');
});

test('standalone Fly env apply remains immediate by default', async () => {
  const stub = stubFlyctl();
  const destination = ENV_DESTINATIONS['podcast-pipeline'];
  importFlyValues(destination, { TEST_SECRET: 'value' });
  assert.equal((await stub.argv()).includes('--stage'), false);
});

test('Fly deploy keeps release metadata on the Depot fallback', () => {
  assert.deepEqual(
    buildFlyDeployArgs({
      config: 'apps/analytics-engine/fly.toml',
      captureRelease: true,
      commitSha: 'abc123',
      buildTime: '2026-08-31T04:29:24Z',
      depot: false,
    }),
    [
      'deploy',
      '.',
      '--remote-only',
      '--config',
      'apps/analytics-engine/fly.toml',
      '--depot=false',
      '--build-arg',
      'COMMIT_SHA=abc123',
      '--build-arg',
      'BUILD_TIME=2026-08-31T04:29:24Z',
    ],
  );
});

test('Depot fallback only matches builder infrastructure failures', () => {
  assert.equal(
    isDepotInfrastructureFailure(
      'Error: failed to fetch an image or build from source: error building: timed out connecting to machine: failed to list workers: Unavailable: connection error: desc = "transport: authentication handshake failed: EOF"',
    ),
    true,
  );
  assert.equal(
    isDepotInfrastructureFailure(
      'Waiting for depot builder...\nError: failed to fetch an image or build from source: error building: process "/bin/sh -c pnpm build" did not complete successfully: exit code: 1',
    ),
    false,
  );
});

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ENV_DESTINATIONS } from '../../config/env.destinations.mjs';
import {
  buildFlyDeployArgs,
  deployFly,
  isDepotInfrastructureFailure,
} from '../fly-deploy.mjs';
import {
  deployStagedFlySecrets,
  importFlyValues,
  listStagedFlyKeys,
  listVercelKeys,
  unsetFlyKeys,
} from './remote.mjs';

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
      `printf '%s\n' "$@" > ${JSON.stringify(argvLog)}`,
      `cat > ${JSON.stringify(stdinLog)}`,
    ].join('\n'),
    { mode: 0o755 },
  );
  process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
  process.env.FLY_API_TOKEN = 'stub-token';
  return {
    argv: async () => (await readFile(argvLog, 'utf8')).trim().split('\n'),
    stdin: async () => await readFile(stdinLog, 'utf8'),
  };
}

function stubFlyctlJson(stdout) {
  const dir = mkdtempSync(path.join(tmpdir(), 'env-fly-json-'));
  const argvLog = path.join(dir, 'argv');
  writeFileSync(
    path.join(dir, 'flyctl'),
    [
      '#!/bin/sh',
      `printf '%s\n' "$@" > ${JSON.stringify(argvLog)}`,
      `printf '%s' ${JSON.stringify(stdout)}`,
    ].join('\n'),
    { mode: 0o755 },
  );
  process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
  process.env.FLY_API_TOKEN = 'stub-token';
  return {
    argv: async () => (await readFile(argvLog, 'utf8')).trim().split('\n'),
  };
}

function stubFlyctlDeploy(sequence) {
  const dir = mkdtempSync(path.join(tmpdir(), 'env-fly-deploy-'));
  const countFile = path.join(dir, 'count');
  const sequenceFile = path.join(dir, 'sequence.json');
  writeFileSync(countFile, '0');
  writeFileSync(sequenceFile, JSON.stringify(sequence));
  // Node stub handles arbitrary stdout/stderr and exit codes without shell escaping issues.
  writeFileSync(
    path.join(dir, 'flyctl'),
    [
      '#!/usr/bin/env node',
      "import { readFileSync, writeFileSync } from 'node:fs';",
      `const DIR = ${JSON.stringify(dir)};`,
      `const COUNT_FILE = ${JSON.stringify(countFile)};`,
      `const SEQUENCE_FILE = ${JSON.stringify(sequenceFile)};`,
      'let count = 0;',
      'try { count = parseInt(readFileSync(COUNT_FILE, "utf8"), 10) || 0; } catch {}',
      'count += 1;',
      'writeFileSync(COUNT_FILE, String(count));',
      'writeFileSync(`${DIR}/argv-${count}`, process.argv.slice(2).join("\\n"));',
      'const seq = JSON.parse(readFileSync(SEQUENCE_FILE, "utf8"));',
      'const entry = seq[count - 1] ?? { code: 0, stdout: "", stderr: "" };',
      'if (entry.stdout) process.stdout.write(entry.stdout);',
      'if (entry.stderr) process.stderr.write(entry.stderr);',
      'process.exit(entry.code ?? entry.status ?? 0);',
    ].join('\n'),
    { mode: 0o755 },
  );
  process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
  process.env.FLY_API_TOKEN = 'stub-token';
  return {
    argv: async (n) =>
      (await readFile(path.join(dir, `argv-${n}`), 'utf8'))
        .trim()
        .split('\n')
        .filter((line) => line.length > 0),
    count: async () => parseInt(await readFile(countFile, 'utf8'), 10) || 0,
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

test('Fly deploy builds args with release metadata', () => {
  assert.deepEqual(
    buildFlyDeployArgs({
      config: 'apps/analytics-engine/fly.toml',
      captureRelease: true,
      commitSha: 'abc123',
      buildTime: '2026-08-31T04:29:24Z',
    }),
    [
      'deploy',
      '.',
      '--remote-only',
      '--config',
      'apps/analytics-engine/fly.toml',
      '--build-arg',
      'COMMIT_SHA=abc123',
      '--build-arg',
      'BUILD_TIME=2026-08-31T04:29:24Z',
    ],
  );
});

test('Fly deploy builds args without release metadata', () => {
  assert.deepEqual(
    buildFlyDeployArgs({
      config: 'apps/podcast-pipeline/fly.toml',
    }),
    [
      'deploy',
      '.',
      '--remote-only',
      '--config',
      'apps/podcast-pipeline/fly.toml',
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

test('deployFly retries once on Depot infrastructure failure with same argv', async () => {
  const depotError =
    'Error: failed to fetch an image or build from source: error building: failed to list workers: Unavailable: connection error: desc = "transport: authentication handshake failed: EOF"';
  const stub = stubFlyctlDeploy([
    { code: 1, stderr: depotError },
    { code: 0, stderr: '' },
  ]);

  const code = await deployFly({
    config: 'apps/analytics-engine/fly.toml',
    sleepMs: 10,
  });

  assert.equal(code, 0);
  assert.equal(await stub.count(), 2);
  const argv1 = await stub.argv(1);
  const argv2 = await stub.argv(2);
  assert.deepEqual(argv1, argv2);
});

test('deployFly retry preserves release metadata', async () => {
  const depotError =
    'Error: failed to fetch an image or build from source: error building: timed out connecting to machine: failed to list workers: Unavailable';
  const stub = stubFlyctlDeploy([
    { code: 1, stderr: depotError },
    { code: 0, stderr: '' },
  ]);

  const code = await deployFly({
    config: 'apps/analytics-engine/fly.toml',
    captureRelease: true,
    commitSha: 'abc123',
    buildTime: '2026-08-31T04:29:24Z',
    sleepMs: 10,
  });

  assert.equal(code, 0);
  assert.equal(await stub.count(), 2);
  const argv1 = await stub.argv(1);
  const argv2 = await stub.argv(2);
  assert.deepEqual(argv1, argv2);
  assert.ok(argv1.includes('--build-arg'));
  assert.ok(argv1.includes('COMMIT_SHA=abc123'));
  assert.ok(argv1.includes('BUILD_TIME=2026-08-31T04:29:24Z'));
});

test('deployFly does not retry on non-Depot failures', async () => {
  const stub = stubFlyctlDeploy([
    {
      code: 1,
      stderr:
        'Waiting for depot builder...\nError: failed to fetch an image or build from source: error building: process "/bin/sh -c pnpm build" did not complete successfully: exit code: 1',
    },
  ]);

  const code = await deployFly({
    config: 'apps/analytics-engine/fly.toml',
    sleepMs: 10,
  });

  assert.equal(code, 1);
  assert.equal(await stub.count(), 1);
});

test('deployFly does not retry on success', async () => {
  const stub = stubFlyctlDeploy([{ code: 0, stderr: '' }]);

  const code = await deployFly({
    config: 'apps/analytics-engine/fly.toml',
    sleepMs: 10,
  });

  assert.equal(code, 0);
  assert.equal(await stub.count(), 1);
});

test('deployFly returns second exit code when retry also fails', async () => {
  const depotError =
    'Error: failed to fetch an image or build from source: error building: deadline_exceeded: context deadline exceeded';
  const stub = stubFlyctlDeploy([
    { code: 1, stderr: depotError },
    { code: 1, stderr: depotError },
  ]);

  const code = await deployFly({
    config: 'apps/analytics-engine/fly.toml',
    sleepMs: 10,
  });

  assert.equal(code, 1);
  assert.equal(await stub.count(), 2);
});

test('listStagedFlyKeys reports staged secrets', async () => {
  const stdout = JSON.stringify([
    { name: 'SUPABASE_URL', digest: 'abc', status: 'Deployed' },
    { name: 'STAGED_SECRET', digest: 'def', status: 'Staged' },
    { name: 'PENDING_SECRET', digest: 'ghi', status: 'Pending' },
  ]);
  stubFlyctlJson(stdout);
  const destination = ENV_DESTINATIONS['podcast-pipeline'];
  const staged = listStagedFlyKeys(destination);
  assert.deepEqual([...staged].sort(), ['PENDING_SECRET', 'STAGED_SECRET']);
});

test('listStagedFlyKeys returns empty when all Deployed', async () => {
  const stdout = JSON.stringify([
    { name: 'SUPABASE_URL', digest: 'abc', status: 'Deployed' },
  ]);
  stubFlyctlJson(stdout);
  const destination = ENV_DESTINATIONS['podcast-pipeline'];
  const staged = listStagedFlyKeys(destination);
  assert.equal(staged.size, 0);
});

test('Fly prune stages unset without immediate rollout', async () => {
  const stub = stubFlyctl();
  const destination = ENV_DESTINATIONS['podcast-pipeline'];
  unsetFlyKeys(destination, ['OLD_SECRET'], { stage: true });
  assert.deepEqual(await stub.argv(), [
    'secrets',
    'unset',
    'OLD_SECRET',
    '--app',
    destination.app,
    '--stage',
  ]);
});

test('deployStagedFlySecrets deploys when staged secrets exist', async () => {
  const destination = ENV_DESTINATIONS['podcast-pipeline'];
  const stagedJson = JSON.stringify([
    { name: 'SUPABASE_URL', digest: 'abc', status: 'Deployed' },
    { name: 'STAGED_SECRET', digest: 'def', status: 'Staged' },
  ]);
  const stub = stubFlyctlDeploy([
    { code: 0, stdout: stagedJson },
    { code: 0, stdout: '' },
  ]);
  deployStagedFlySecrets(destination);
  assert.equal(await stub.count(), 2);
  const listArgv = await stub.argv(1);
  assert.deepEqual(listArgv.slice(0, 2), ['secrets', 'list']);
  assert.ok(listArgv.includes('--json'));
  const deployArgv = await stub.argv(2);
  assert.deepEqual(deployArgv, ['secrets', 'deploy', '--app', destination.app]);
});

test('deployStagedFlySecrets skips deploy when no staged secrets', async () => {
  const destination = ENV_DESTINATIONS['podcast-pipeline'];
  const deployedJson = JSON.stringify([
    { name: 'SUPABASE_URL', digest: 'abc', status: 'Deployed' },
  ]);
  const stub = stubFlyctlDeploy([{ code: 0, stdout: deployedJson }]);
  deployStagedFlySecrets(destination);
  assert.equal(await stub.count(), 1);
  const listArgv = await stub.argv(1);
  assert.deepEqual(listArgv.slice(0, 2), ['secrets', 'list']);
});

test('deployStagedFlySecrets propagates deploy failure', () => {
  const destination = ENV_DESTINATIONS['podcast-pipeline'];
  const stagedJson = JSON.stringify([
    { name: 'STAGED_SECRET', digest: 'def', status: 'Staged' },
  ]);
  stubFlyctlDeploy([
    { code: 0, stdout: stagedJson },
    {
      code: 1,
      stderr: "timeout reached waiting for machine's state to change",
    },
  ]);
  assert.throws(() => deployStagedFlySecrets(destination), {
    message: /Fly deploy failed for from-fed-to-chain-api/u,
  });
});

test('staged Fly env apply uses single rollout: stage import + stage unset + one deploy', async () => {
  const destination = ENV_DESTINATIONS['podcast-pipeline'];
  const stagedJson = JSON.stringify([
    { name: 'STAGED_SECRET', digest: 'def', status: 'Staged' },
  ]);
  // Sequence: import (stage), unset (stage), list (for deploy check), deploy
  const stub = stubFlyctlDeploy([
    { code: 0, stdout: '' },
    { code: 0, stdout: '' },
    { code: 0, stdout: stagedJson },
    { code: 0, stdout: '' },
  ]);
  importFlyValues(destination, { TEST_SECRET: 'value' }, { stage: true });
  unsetFlyKeys(destination, ['OLD_SECRET'], { stage: true });
  deployStagedFlySecrets(destination);
  assert.equal(await stub.count(), 4);
  const importArgv = await stub.argv(1);
  assert.deepEqual(importArgv, [
    'secrets',
    'import',
    '--app',
    destination.app,
    '--stage',
  ]);
  const unsetArgv = await stub.argv(2);
  assert.deepEqual(unsetArgv, [
    'secrets',
    'unset',
    'OLD_SECRET',
    '--app',
    destination.app,
    '--stage',
  ]);
  const deployArgv = await stub.argv(4);
  assert.deepEqual(deployArgv, ['secrets', 'deploy', '--app', destination.app]);
});

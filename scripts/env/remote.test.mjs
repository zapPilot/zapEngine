import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ENV_DESTINATIONS } from '../../config/env.destinations.mjs';
import { listVercelKeys } from './remote.mjs';

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

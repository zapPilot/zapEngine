import assert from 'node:assert/strict';
import test from 'node:test';

import { deployVercelMain } from './deploy-vercel-main.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function fakeVercel(statesByProject) {
  const calls = [];
  const deploymentProject = new Map();
  const remainingStates = new Map(
    Object.entries(statesByProject).map(([project, states]) => [
      project,
      [...states],
    ]),
  );

  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method ?? 'GET', body: init.body });

    if ((init.method ?? 'GET') === 'POST') {
      const body = JSON.parse(String(init.body));
      const id = `dpl_${body.name}`;
      deploymentProject.set(id, body.name);
      const states = remainingStates.get(body.name);
      assert.ok(states, `unexpected project ${body.name}`);
      return jsonResponse({
        id,
        readyState: states.shift(),
        url: `${id}.vercel.app`,
      });
    }

    const id = decodeURIComponent(url.split('/deployments/')[1].split('?')[0]);
    const project = deploymentProject.get(id);
    assert.ok(project, `unknown deployment ${id}`);
    const states = remainingStates.get(project);
    assert.ok(states && states.length > 0, `no remaining state for ${project}`);
    return jsonResponse({ id, readyState: states.shift() });
  };

  return { fetchImpl, calls };
}

test('waits for every production deployment to become READY', async () => {
  const { fetchImpl, calls } = fakeVercel({
    'zap-engine-frontend': ['BUILDING', 'READY'],
    'zap-engine-landing-page': ['QUEUED', 'READY'],
    'zap-engine-control-center': ['INITIALIZING', 'READY'],
  });

  await deployVercelMain({
    token: 'token',
    sha: SHA,
    fetchImpl,
    sleep: async () => {},
    now: () => 1_000,
  });

  assert.equal(calls.filter((call) => call.method === 'POST').length, 3);
  assert.equal(calls.filter((call) => call.method === 'GET').length, 3);
  for (const call of calls.filter((entry) => entry.method === 'POST')) {
    const body = JSON.parse(String(call.body));
    assert.equal(body.target, 'production');
    assert.equal(body.gitSource.ref, 'main');
    assert.equal(body.gitSource.sha, SHA);
  }
});

test('fails the workflow when a Vercel build reaches ERROR', async () => {
  const { fetchImpl } = fakeVercel({
    'zap-engine-frontend': ['BUILDING', 'ERROR'],
    'zap-engine-landing-page': ['READY'],
    'zap-engine-control-center': ['READY'],
  });

  await assert.rejects(
    deployVercelMain({
      token: 'token',
      sha: SHA,
      fetchImpl,
      sleep: async () => {},
      now: () => 1_000,
    }),
    /zap-engine-frontend ended ERROR/,
  );
});

test('fails when production alias assignment reports an error', async () => {
  const { fetchImpl: baseFetch } = fakeVercel({
    'zap-engine-frontend': ['READY'],
    'zap-engine-landing-page': ['READY'],
    'zap-engine-control-center': ['READY'],
  });

  const fetchImpl = async (input, init) => {
    const response = await baseFetch(input, init);
    if ((init?.method ?? 'GET') !== 'POST') return response;
    const body = JSON.parse(String(init.body));
    if (body.name !== 'zap-engine-control-center') return response;
    const deployment = await response.json();
    return jsonResponse({
      ...deployment,
      aliasError: { code: 'alias_failed', message: 'alias failed' },
    });
  };

  await assert.rejects(
    deployVercelMain({
      token: 'token',
      sha: SHA,
      fetchImpl,
      sleep: async () => {},
      now: () => 1_000,
    }),
    /production aliasing failed/,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { deployVercelMain } from './deploy-vercel-main.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const PROJECTS = [
  'zap-engine-frontend',
  'zap-engine-landing-page',
  'zap-engine-control-center',
];
const POLL_MS = 5_000;

const minutes = (value) => Math.round(value * 60_000);
const firstPollAtOrAfter = (ms) => Math.ceil(ms / POLL_MS) * POLL_MS;

// Resolving bodies without I/O keeps every poll inside one macrotask, which is
// what lets the fake clock below advance only once all waiters are asleep.
function jsonResponse(body) {
  const text = JSON.stringify(body);
  return { ok: true, status: 200, text: async () => text };
}

// Virtual time shared by the three concurrent waiters: time jumps to the
// earliest pending wake-up only after every in-flight poll has settled, so each
// waiter sees real 5-second spacing instead of time advancing once per sleep
// call.
function fakeClock() {
  let time = 0;
  let sequence = 0;
  let scheduled = false;
  const timers = [];

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setImmediate(() => {
      scheduled = false;
      if (timers.length === 0) return;
      timers.sort((a, b) => a.at - b.at || a.sequence - b.sequence);
      const next = timers.shift();
      time = next.at;
      next.resolve();
      schedule();
    });
  };

  return {
    now: () => time,
    sleep: (ms) =>
      new Promise((resolve) => {
        timers.push({ at: time + ms, sequence: sequence++, resolve });
        schedule();
      }),
  };
}

// Each timeline lists [minute, readyState, extraFields?]; the state served at
// any moment is the last entry whose minute has been reached. Projects without
// a timeline are READY immediately.
function fakeVercel(clock, timelines = {}) {
  const calls = [];
  const projectById = new Map();

  const deploymentAt = (id) => {
    const project = projectById.get(id);
    const timeline = timelines[project] ?? [[0, 'READY']];
    const current = timeline.findLast(([at]) => minutes(at) <= clock.now());
    assert.ok(current, `${project} has no state at ${clock.now()}ms`);
    const [, readyState, extra = {}] = current;
    return {
      id,
      readyState,
      url: `${id}.vercel.app`,
      inspectorUrl: `https://vercel.com/inspect/${id}`,
      ...extra,
    };
  };

  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';

    if (method === 'POST') {
      const body = JSON.parse(String(init.body));
      assert.ok(
        PROJECTS.includes(body.name),
        `unexpected project ${body.name}`,
      );
      const id = `dpl_${body.name}`;
      projectById.set(id, body.name);
      const deployment = deploymentAt(id);
      calls.push({
        method,
        project: body.name,
        at: clock.now(),
        body,
        state: deployment.readyState,
      });
      return jsonResponse(deployment);
    }

    const id = decodeURIComponent(url.split('/deployments/')[1].split('?')[0]);
    assert.ok(projectById.has(id), `unknown deployment ${id}`);
    const deployment = deploymentAt(id);
    calls.push({
      method,
      project: projectById.get(id),
      at: clock.now(),
      state: deployment.readyState,
    });
    return jsonResponse(deployment);
  };

  return { fetchImpl, calls };
}

function deploy(timelines) {
  const clock = fakeClock();
  const { fetchImpl, calls } = fakeVercel(clock, timelines);
  const result = deployVercelMain({
    token: 'token',
    sha: SHA,
    fetchImpl,
    sleep: clock.sleep,
    now: clock.now,
  });
  return { result, clock, calls };
}

function observedStates(calls, project) {
  return calls
    .filter((call) => call.project === project)
    .map((call) => call.state)
    .filter((state, index, states) => state !== states[index - 1]);
}

test('creates every production deployment from the checked-out main SHA and waits for READY', async () => {
  const { result, clock, calls } = deploy({
    'zap-engine-frontend': [
      [0, 'BUILDING'],
      [0.5, 'READY'],
    ],
    'zap-engine-landing-page': [
      [0, 'QUEUED'],
      [0.25, 'READY'],
    ],
    'zap-engine-control-center': [
      [0, 'INITIALIZING'],
      [0.1, 'READY'],
    ],
  });

  await result;

  const posts = calls.filter((call) => call.method === 'POST');
  assert.deepEqual(
    posts.map((call) => call.project).sort(),
    [...PROJECTS].sort(),
  );
  for (const { body } of posts) {
    assert.equal(body.target, 'production');
    assert.equal(body.gitSource.ref, 'main');
    assert.equal(body.gitSource.sha, SHA);
  }
  assert.equal(clock.now(), minutes(0.5));
});

test('replays run 35966808522: frontend queued 4.2 minutes behind the other builds, READY at 16.0 minutes', async () => {
  const { result, clock, calls } = deploy({
    'zap-engine-control-center': [
      [0, 'BUILDING'],
      [1.5, 'READY'],
    ],
    'zap-engine-landing-page': [
      [0, 'QUEUED'],
      [1.6, 'BUILDING'],
      [4.2, 'READY'],
    ],
    'zap-engine-frontend': [
      [0, 'QUEUED'],
      [4.2, 'BUILDING'],
      [16.0, 'READY'],
    ],
  });

  await result;

  assert.equal(clock.now(), firstPollAtOrAfter(minutes(16.0)));
  assert.deepEqual(observedStates(calls, 'zap-engine-frontend'), [
    'QUEUED',
    'BUILDING',
    'READY',
  ]);
});

test('replays run 35868682042: control-center queued 18.1 minutes, READY at 19.8 minutes', async () => {
  const { result, clock } = deploy({
    // Landing's exact timings were not retained; it only has to finish before
    // the frontend build takes the single build slot at 8.1 minutes.
    'zap-engine-landing-page': [
      [0, 'QUEUED'],
      [5.5, 'BUILDING'],
      [8.1, 'READY'],
    ],
    'zap-engine-frontend': [
      [0, 'QUEUED'],
      [8.1, 'BUILDING'],
      [18.1, 'READY'],
    ],
    'zap-engine-control-center': [
      [0, 'QUEUED'],
      [18.1, 'BUILDING'],
      [19.8, 'READY'],
    ],
  });

  await result;

  assert.equal(clock.now(), firstPollAtOrAfter(minutes(19.8)));
});

test('follows QUEUED -> INITIALIZING -> BUILDING -> READY within the build limit', async () => {
  const { result, clock, calls } = deploy({
    'zap-engine-frontend': [
      [0, 'QUEUED'],
      [3, 'INITIALIZING'],
      [4, 'BUILDING'],
      [17.5, 'READY'],
    ],
  });

  await result;

  assert.equal(clock.now(), minutes(17.5));
  assert.deepEqual(observedStates(calls, 'zap-engine-frontend'), [
    'QUEUED',
    'INITIALIZING',
    'BUILDING',
    'READY',
  ]);
});

test('fails with the queue history when a deployment is still QUEUED at the overall limit', async () => {
  const { result, clock } = deploy({
    'zap-engine-frontend': [[0, 'QUEUED']],
  });

  await assert.rejects(
    result,
    new RegExp(
      'Timed out waiting for Vercel deployment dpl_zap-engine-frontend for zap-engine-frontend: ' +
        'still QUEUED after 25\\.0 min queued, 0\\.0 min building ' +
        '\\(exceeded the 25-minute overall limit\\); ' +
        'inspect https://vercel\\.com/inspect/dpl_zap-engine-frontend$',
    ),
  );
  assert.equal(clock.now(), minutes(25));
});

test('fails when a deployment is still building 15 minutes after it left the queue, counting INITIALIZING', async () => {
  const { result, clock } = deploy({
    'zap-engine-frontend': [
      [0, 'QUEUED'],
      [2, 'INITIALIZING'],
      [4, 'BUILDING'],
    ],
  });

  await assert.rejects(
    result,
    /zap-engine-frontend: still BUILDING after 2\.0 min queued, 15\.0 min building \(exceeded the 15-minute build limit\); inspect https:\/\/vercel\.com\/inspect\/dpl_zap-engine-frontend$/,
  );
  assert.equal(clock.now(), minutes(17));
});

test('caps a long queue plus build at the overall limit', async () => {
  const { result, clock } = deploy({
    'zap-engine-frontend': [
      [0, 'QUEUED'],
      [12, 'BUILDING'],
    ],
  });

  await assert.rejects(
    result,
    /zap-engine-frontend: still BUILDING after 12\.0 min queued, 13\.0 min building \(exceeded the 25-minute overall limit\)/,
  );
  assert.equal(clock.now(), minutes(25));
});

test('re-reads the deployment at the deadline instead of failing on the last poll before it', async () => {
  const { result, clock, calls } = deploy({
    'zap-engine-frontend': [
      [0, 'BUILDING'],
      [15, 'READY'],
    ],
  });

  await result;

  const frontendReads = calls.filter(
    (call) => call.project === 'zap-engine-frontend',
  );
  assert.deepEqual(
    frontendReads.slice(-2).map(({ at, state }) => ({ at, state })),
    [
      { at: minutes(15) - POLL_MS, state: 'BUILDING' },
      { at: minutes(15), state: 'READY' },
    ],
  );
  assert.equal(clock.now(), minutes(15));
});

test('fails immediately when a deployment is CANCELED while still queued', async () => {
  const { result, clock } = deploy({
    'zap-engine-frontend': [
      [0, 'QUEUED'],
      [3, 'CANCELED'],
    ],
  });

  await assert.rejects(
    result,
    /dpl_zap-engine-frontend for zap-engine-frontend ended CANCELED; inspect https:\/\/vercel\.com\/inspect\/dpl_zap-engine-frontend$/,
  );
  assert.equal(clock.now(), minutes(3));
});

test('fails the workflow when a Vercel build reaches ERROR', async () => {
  const { result, clock } = deploy({
    'zap-engine-frontend': [
      [0, 'BUILDING'],
      [6, 'ERROR'],
    ],
  });

  await assert.rejects(result, /zap-engine-frontend ended ERROR/);
  assert.equal(clock.now(), minutes(6));
});

test('fails when production alias assignment reports an error', async () => {
  const { result } = deploy({
    'zap-engine-control-center': [
      [
        0,
        'READY',
        { aliasError: { code: 'alias_failed', message: 'alias failed' } },
      ],
    ],
  });

  await assert.rejects(
    result,
    /zap-engine-control-center is ready but production aliasing failed: \{"code":"alias_failed","message":"alias failed"\}/,
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drainReady, inspectFleet } from './podcast-deployment-gate.mjs';

const idle = { active_video_jobs: 0, active_visual_jobs: 0 };
const machine = (group, state, digest = 'sha256:one') => ({
  state,
  image_ref: { digest },
  config: { metadata: { fly_process_group: group } },
});

test('drain requires every render Machine to be stopped and both lease counts to be zero', () => {
  assert.equal(drainReady(idle, [machine('render', 'stopped')]), true);
  for (const state of [
    'started',
    'starting',
    'stopping',
    'suspended',
    'destroyed',
    '',
  ]) {
    assert.equal(drainReady(idle, [machine('render', state)]), false, state);
  }
  assert.equal(drainReady(idle, []), false);
  assert.equal(
    drainReady({ ...idle, active_video_jobs: 1 }, [
      machine('render', 'stopped'),
    ]),
    false,
  );
  assert.equal(
    drainReady({ ...idle, active_visual_jobs: 1 }, [
      machine('render', 'stopped'),
    ]),
    false,
  );
  for (const status of [
    null,
    {},
    { ...idle, active_video_jobs: null },
    { ...idle, active_video_jobs: -1 },
  ]) {
    assert.throws(
      () => drainReady(status, [machine('render', 'stopped')]),
      /invalid active job counts/,
    );
  }
});

test('fleet compares image digest values and rejects incomplete or transitional fleets', () => {
  const app = machine('app', 'started');
  const render = machine('render', 'stopped');
  assert.equal(inspectFleet([app, render]).ok, true);
  assert.equal(
    inspectFleet([app, machine('render', 'stopped', 'sha256:two')]).ok,
    false,
  );
  assert.equal(inspectFleet([app, machine('render', 'starting')]).ok, false);
  assert.equal(inspectFleet([app]).ok, false);
  assert.equal(inspectFleet([render]).ok, false);
  assert.equal(
    inspectFleet([app, { state: 'stopped', process_group: 'render' }]).ok,
    false,
  );
});

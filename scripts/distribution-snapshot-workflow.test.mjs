import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const WORKFLOW = '.github/workflows/distribution-snapshot.yml';
const BUILD_STEP = '- name: Build distribution snapshot runtime dependencies';
const SNAPSHOT_STEP = '- name: Regenerate the distribution snapshot';
const TYPES_BUILD = '--filter=@zapengine/types';
const STORY_BUILD = '--filter=@zapengine/zap-pilot-story';
const SNAPSHOT_COMMAND =
  'pnpm --filter @zapengine/podcast-pipeline social:distribution-snapshot';

test('builds runtime types before running the distribution snapshot CLI', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');
  const buildStepIndex = workflow.indexOf(BUILD_STEP);
  const snapshotStepIndex = workflow.indexOf(SNAPSHOT_STEP);

  assert.notEqual(
    buildStepIndex,
    -1,
    'distribution snapshot runtime build step must exist',
  );
  assert.notEqual(
    snapshotStepIndex,
    -1,
    'distribution snapshot CLI step must exist',
  );
  assert.ok(
    buildStepIndex < snapshotStepIndex,
    'runtime dependency build step must run before the snapshot step',
  );

  const buildCommandIndex = workflow.indexOf(
    'pnpm turbo run build',
    buildStepIndex,
  );
  assert.ok(
    buildCommandIndex > buildStepIndex && buildCommandIndex < snapshotStepIndex,
    'runtime build step must execute a turbo build before the snapshot step',
  );
  const buildStepEnd = workflow.indexOf(
    '\n      - ',
    buildStepIndex + BUILD_STEP.length,
  );
  const buildStepBody = workflow.slice(
    buildStepIndex,
    buildStepEnd === -1 ? snapshotStepIndex : buildStepEnd,
  );
  assert.ok(
    buildStepBody.includes(TYPES_BUILD),
    'runtime build step must build @zapengine/types',
  );
  assert.ok(
    buildStepBody.includes(STORY_BUILD),
    'runtime build step must build @zapengine/zap-pilot-story',
  );

  const nextStepIndex = workflow.indexOf(
    '\n      - ',
    snapshotStepIndex + SNAPSHOT_STEP.length,
  );
  const snapshotStepBody = workflow.slice(
    snapshotStepIndex,
    nextStepIndex === -1 ? workflow.length : nextStepIndex,
  );
  assert.ok(
    snapshotStepBody.includes(SNAPSHOT_COMMAND),
    'distribution snapshot step must execute the podcast snapshot CLI',
  );
});

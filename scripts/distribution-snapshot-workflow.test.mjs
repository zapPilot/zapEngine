import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const WORKFLOW = '.github/workflows/distribution-snapshot.yml';
const BUILD_STEP = '- name: Build distribution snapshot runtime dependency';
const SNAPSHOT_STEP = '- name: Regenerate the distribution snapshot';
const TYPES_BUILD = 'pnpm --filter @zapengine/types build';
const SNAPSHOT_COMMAND =
  'pnpm --filter @zapengine/podcast-pipeline social:distribution-snapshot';

test('builds runtime types before running the distribution snapshot CLI', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');
  const buildStepIndex = workflow.indexOf(BUILD_STEP);
  const snapshotStepIndex = workflow.indexOf(SNAPSHOT_STEP);

  assert.notEqual(buildStepIndex, -1, 'distribution snapshot runtime build step must exist');
  assert.notEqual(snapshotStepIndex, -1, 'distribution snapshot CLI step must exist');
  assert.ok(
    buildStepIndex < snapshotStepIndex,
    'runtime dependency build step must run before the snapshot step',
  );

  const buildCommandIndex = workflow.indexOf(`run: ${TYPES_BUILD}`, buildStepIndex);
  assert.ok(
    buildCommandIndex > buildStepIndex && buildCommandIndex < snapshotStepIndex,
    'runtime build step must execute the @zapengine/types build command',
  );

  const nextStepIndex = workflow.indexOf('\n      - ', snapshotStepIndex + SNAPSHOT_STEP.length);
  const snapshotStepBody = workflow.slice(
    snapshotStepIndex,
    nextStepIndex === -1 ? workflow.length : nextStepIndex,
  );
  assert.ok(
    snapshotStepBody.includes(SNAPSHOT_COMMAND),
    'distribution snapshot step must execute the podcast snapshot CLI',
  );
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const WORKFLOW = '.github/workflows/distribution-snapshot.yml';
const TYPES_BUILD = 'pnpm --filter @zapengine/types build';
const SNAPSHOT_COMMAND =
  'pnpm --filter @zapengine/podcast-pipeline social:distribution-snapshot';

test('builds runtime types before running the distribution snapshot CLI', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');
  const buildIndex = workflow.indexOf(TYPES_BUILD);
  const snapshotIndex = workflow.indexOf(SNAPSHOT_COMMAND);

  assert.notEqual(buildIndex, -1, 'distribution snapshot must build @zapengine/types');
  assert.notEqual(snapshotIndex, -1, 'distribution snapshot CLI command must exist');
  assert.ok(
    buildIndex < snapshotIndex,
    '@zapengine/types must be built before the snapshot CLI imports its dist exports',
  );
});

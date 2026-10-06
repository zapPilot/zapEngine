import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { publishSteps } from './sales-publish.mjs';
test('build then publish through Kokode Infisical, outside Turbo', () => {
  const steps = publishSteps(['kokode']);
  assert.deepEqual(steps[0].args, [
    'turbo',
    'run',
    'build',
    '--filter=@zapengine/kokode-ai^...',
  ]);
  assert.deepEqual(steps[1], {
    cmd: 'bash',
    args: [
      'apps/kokode-ai/scripts/infisical.sh',
      'kokode',
      '--',
      'pnpm',
      '--filter',
      '@zapengine/kokode-ai',
      'media:publish',
      '--video-out-dir',
      path.resolve(import.meta.dirname, '../apps/video/out/kokode-clinic'),
    ],
  });
});
test('dry-run does not load secrets', () => {
  assert.equal(publishSteps(['--', 'kokode', '--dry-run'])[1].cmd, 'pnpm');
});
test('unsupported products and flags fail closed', () => {
  for (const args of [[], ['nope'], ['zap-pilot'], ['kokode', '--only']])
    assert.throws(() => publishSteps(args));
});

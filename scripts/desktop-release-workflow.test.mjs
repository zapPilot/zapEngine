import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
const workflow = parse(
  readFileSync(
    new URL('../.github/workflows/desktop-release.yml', import.meta.url),
    'utf8',
  ),
);
test('release trigger, dry-run boundary and least privileges', () => {
  assert.deepEqual(workflow.on.push.tags, ['desktop-v*']);
  assert.ok('workflow_dispatch' in workflow.on);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.equal(workflow.jobs.build.environment, 'desktop-release');
  assert.equal(workflow.jobs.build['runs-on'], 'macos-26');
  assert.match(workflow.jobs.build.if, /refs\/heads\/main/);
  assert.deepEqual(workflow.jobs.publish.permissions, { contents: 'write' });
  assert.equal(workflow.jobs.publish.environment, undefined);
  assert.equal(workflow.jobs.publish.needs, 'build');
  assert.match(workflow.jobs.publish.if, /push/);
});
test('bundle precedes signing and verified checksums precede publish', () => {
  const steps = workflow.jobs.build.steps;
  const names = steps.map((step) => step.name);
  assert.ok(names.indexOf('Bundle') < names.indexOf('Sign'));
  assert.ok(names.indexOf('Sign') < names.indexOf('Verify'));
  assert.ok(names.indexOf('Verify') < names.indexOf('Checksums'));
  for (const step of steps)
    if (step.name !== 'Sign')
      assert.doesNotMatch(JSON.stringify(step), /secrets\.(MAC_|APPLE_)/);
  assert.equal(
    steps.find((step) => step.name === 'Sign').env.INFISICAL_TOKEN,
    '',
  );
  assert.equal(steps.at(-1).if, 'always()');
  assert.doesNotMatch(
    JSON.stringify(workflow.jobs.publish),
    /pnpm|install|setup-workspace/,
  );
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
const workflow = parse(
  readFileSync(
    new URL('../.github/workflows/release-mobile.yml', import.meta.url),
    'utf8',
  ),
);
const jobs = workflow.jobs;
const text = (value) => JSON.stringify(value);

test('inputs keep their options and add the iOS version policy', () => {
  const inputs = workflow.on.workflow_dispatch.inputs;
  assert.deepEqual(inputs.platform.options, ['android', 'ios', 'both']);
  assert.deepEqual(inputs.mode.options, [
    'build-and-submit',
    'build-only',
    'submit-only',
  ]);
  assert.equal(inputs.ios_version_policy.required, true);
  assert.equal(inputs.ios_version_policy.default, 'auto');
  assert.equal(inputs.ios_version_policy.type, 'choice');
  assert.deepEqual(inputs.ios_version_policy.options, [
    'auto',
    'keep',
    'bump-patch',
  ]);
});

test('one global release slot is kept', () => {
  assert.deepEqual(workflow.concurrency, {
    group: 'release-mobile',
    'cancel-in-progress': false,
  });
});

test('only build-ios uses the ios-release environment', () => {
  for (const [name, job] of Object.entries(jobs)) {
    assert.equal(
      job.environment,
      name === 'build-ios' ? 'ios-release' : undefined,
      name,
    );
  }
});

test('Apple secrets appear only in the build-ios release step', () => {
  for (const [name, job] of Object.entries(jobs)) {
    for (const step of job.steps) {
      const hasApple = /secrets\.APPLE_/.test(text(step));
      const isRelease =
        name === 'build-ios' &&
        step.name === 'Resolve iOS App Version and build on EAS';
      assert.equal(hasApple, isRelease, `${name}: ${step.name ?? step.uses}`);
    }
  }
  const release = jobs['build-ios'].steps.find((step) => step.id === 'build');
  assert.match(release.run, /ios:release --policy "\$IOS_VERSION_POLICY"/);
  assert.match(release.run, /unset APPLE_API_KEY_P8/);
});

test('Android and submit jobs never touch ASC or the version policy', () => {
  for (const name of ['build-android', 'submit-android', 'submit-ios']) {
    assert.doesNotMatch(
      text(jobs[name]),
      /APPLE_|ios:release|ios_version_policy|IOS_VERSION_POLICY/,
      name,
    );
  }
});

test('submit-ios submits the exact build ID and build-ios skips submit-only', () => {
  const submit = jobs['submit-ios'].steps.at(-1);
  assert.match(submit.run, /ios:submit "\$BUILD_ID"/);
  assert.match(jobs['build-ios'].if, /inputs\.mode != 'submit-only'/);
  assert.deepEqual(jobs['submit-ios'].needs, ['gate', 'build-ios']);
});

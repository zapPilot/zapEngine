import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  changedPaths,
  discoverConfiguredGlobalTestFiles,
  evaluateGuard,
} from './test-qa-guard.mjs';
import { GLOBAL_TEST_CONFIGS } from './test-qa-lib.mjs';

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

test('guard allows ordinary test and test-helper changes', () => {
  assert.equal(
    evaluateGuard({
      paths: [
        'apps/foo/src/a.test.ts',
        'apps/foo/tests/helpers.ts',
        'apps/foo/src/__mocks__/api.ts',
      ],
      diff: '+expect(value).toBe(1);',
    }).decision,
    'allow',
  );
});

test('guard denies production and global setup paths', () => {
  const production = evaluateGuard({
    paths: ['apps/foo/src/a.ts'],
    diff: '',
  });
  assert.equal(production.decision, 'deny');
  assert.match(production.reasons[0], /test\/test-helper paths only/u);

  const setup = evaluateGuard({
    paths: ['apps/account-engine/vitest.setup.ts'],
    diff: '',
  });
  assert.equal(setup.decision, 'deny');
  assert.match(setup.reasons[0], /global test setup/u);
});

test('guard denies new skip/focus, coverage ignore, and TypeScript suppressions', () => {
  const result = evaluateGuard({
    paths: ['apps/foo/src/a.test.ts'],
    diff: [
      '+++ b/apps/foo/src/a.test.ts',
      '+describe.only("x", () => {});',
      '+test.skip("y", () => {});',
      '+xit("z", () => {});',
      '+/* c8 ignore next */',
      '+// @ts-ignore',
      '+// @ts-nocheck',
    ].join('\n'),
  });
  assert.equal(result.decision, 'deny');
  assert.ok(result.reasons.some((reason) => reason.includes('focused test')));
  assert.ok(result.reasons.some((reason) => reason.includes('skipped test')));
  assert.ok(result.reasons.some((reason) => reason.includes('xit')));
  assert.ok(
    result.reasons.some((reason) => reason.includes('coverage ignore')),
  );
  assert.ok(result.reasons.some((reason) => reason.includes('@ts-ignore')));
  assert.ok(result.reasons.some((reason) => reason.includes('@ts-nocheck')));
});

test('rename inspection includes both old and new paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'test-qa-guard-'));
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test');
    await mkdir(join(root, 'apps/foo/src'), { recursive: true });
    await writeFile(
      join(root, 'apps/foo/src/a.test.ts'),
      'export const fixture = 1;\n',
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'first');
    git(root, 'mv', 'apps/foo/src/a.test.ts', 'apps/foo/src/a.ts');
    git(root, 'commit', '-qm', 'rename');

    const paths = changedPaths(root, 'HEAD^', 'HEAD');
    assert.deepEqual(paths.sort(), [
      'apps/foo/src/a.test.ts',
      'apps/foo/src/a.ts',
    ]);
    assert.equal(evaluateGuard({ paths, diff: '' }).decision, 'deny');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('global setup denylist stays aligned with every vitest setup and conftest', () => {
  assert.deepEqual(
    discoverConfiguredGlobalTestFiles(process.cwd()),
    [...GLOBAL_TEST_CONFIGS].sort(),
  );
});

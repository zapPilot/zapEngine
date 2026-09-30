import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  changedPaths,
  diffText,
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

test('guard excludes e2e and root script tests even inside helper directories', () => {
  for (const path of [
    'apps/app/tests/e2e/example.spec.ts',
    'scripts/tests/example.test.mjs',
    'scripts/fixtures/data.snap',
  ]) {
    assert.equal(
      evaluateGuard({ paths: [path], diff: '' }).decision,
      'deny',
      path,
    );
  }
});

test('local guard inspects staged, unstaged and new files while explicit head checks commits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'test-qa-working-'));
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test');
    await mkdir(join(root, 'apps/foo/src'), { recursive: true });
    await writeFile(
      join(root, 'apps/foo/src/a.ts'),
      'export const value = 1;\n',
    );
    await writeFile(
      join(root, 'apps/foo/src/a.test.ts'),
      'test("works", () => {});\n',
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    await writeFile(
      join(root, 'apps/foo/src/a.ts'),
      'export const value = 2;\n',
    );
    const local = () =>
      evaluateGuard({
        paths: changedPaths(root, 'HEAD'),
        diff: diffText(root, 'HEAD'),
      });
    assert.equal(local().decision, 'deny');
    git(root, 'add', '.');
    assert.equal(local().decision, 'deny');
    assert.deepEqual(changedPaths(root, 'HEAD', 'HEAD'), []);
    await writeFile(
      join(root, 'apps/foo/src/a.ts'),
      'export const value = 1;\n',
    );
    assert.equal(
      local().decision,
      'deny',
      'staged production edits cannot be hidden by unstaged restoration',
    );
    git(root, 'add', '.');
    await writeFile(
      join(root, 'apps/foo/src/a.test.ts'),
      'test.skip("works", () => {});\n',
    );
    assert.equal(local().decision, 'deny');
    await writeFile(
      join(root, 'apps/foo/src/a.test.ts'),
      'test("works", () => {});\n',
    );
    await writeFile(
      join(root, 'apps/foo/src/new.test.ts'),
      'test("new", () => {});\n',
    );
    assert.ok(changedPaths(root, 'HEAD').includes('apps/foo/src/new.test.ts'));
    const guard = join(process.cwd(), 'scripts/agents/test-qa-guard.mjs');
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [guard, '--repo', root, '--base', 'HEAD'],
          { encoding: 'utf8' },
        ),
      (error) => error.status === 1 && error.stdout.includes('Stage new files'),
    );
    git(root, 'add', '.');
    assert.equal(
      JSON.parse(
        execFileSync(
          process.execPath,
          [guard, '--repo', root, '--base', 'HEAD'],
          { encoding: 'utf8' },
        ),
      ).decision,
      'allow',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('guard rejects conditional, todo, expected failure, focus and branch ignores', () => {
  for (const added of [
    'test.skipIf(true)(',
    'test.runIf(true)(',
    'test.todo(',
    'test.fails(',
    'xdescribe(',
    'xtest(',
    'fit(',
    'fdescribe(',
    '@pytest.mark.skipif',
    '@pytest.mark.xfail',
    'pytest.importorskip(',
    '# pragma: no branch',
  ]) {
    assert.equal(
      evaluateGuard({ paths: ['apps/foo/src/a.test.ts'], diff: `+${added}` })
        .decision,
      'deny',
      added,
    );
  }
});

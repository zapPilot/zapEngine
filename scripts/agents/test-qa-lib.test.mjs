import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  collectScopes,
  fingerprintPaths,
  parseJsonc,
  primarySubject,
  safePath,
} from './test-qa-lib.mjs';

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

async function put(root, path, content) {
  const absolute = join(root, path);
  await mkdir(join(absolute, '..'), { recursive: true }).catch(() => {});
  await mkdir(absolute.slice(0, absolute.lastIndexOf('/')), {
    recursive: true,
  });
  await writeFile(absolute, content);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'test-qa-lib-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  await put(
    root,
    'apps/foo/package.json',
    JSON.stringify({
      name: '@zapengine/foo',
      scripts: {
        'type-check': 'tsc --noEmit',
        'dup:check': 'echo dup',
      },
    }),
  );
  await put(
    root,
    'apps/foo/tsconfig.json',
    `{
      // inherited configs may have comments
      "compilerOptions": {
        "baseUrl": ".",
        "paths": { "@/*": ["src/*"], },
      },
    }`,
  );
  await put(root, 'apps/foo/src/github.ts', 'export const value = 1;\n');
  await put(root, 'apps/foo/src/other.ts', 'export const other = 2;\n');
  await put(root, 'apps/foo/tests/helpers.ts', 'export const helper = 1;\n');
  await put(
    root,
    'apps/foo/src/github.test.ts',
    "import { value } from './github.js';\nimport { helper } from '../tests/helpers.js';\nvoid value; void helper;\n",
  );
  await put(
    root,
    'apps/foo/src/github-coverage.test.ts',
    "import { value } from '@/github.js';\nvoid value;\n",
  );
  await put(
    root,
    'apps/foo/src/standalone.test.ts',
    "test('standalone', () => {});\n",
  );
  await put(
    root,
    'apps/foo/src/ambiguous.test.ts',
    "import './github.js';\nimport './other.js';\n",
  );
  await put(
    root,
    'apps/analytics-engine/src/services/calculator.py',
    'def calculate():\n    return 1\n',
  );
  await put(
    root,
    'apps/analytics-engine/tests/test_calculator.py',
    'from src.services.calculator import calculate\n\nassert calculate\n',
  );
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture');
  return root;
}

test('safePath rejects traversal and absolute paths', () => {
  assert.equal(safePath('apps/foo/src/a.test.ts'), true);
  assert.equal(safePath('../a.test.ts'), false);
  assert.equal(safePath('/tmp/a.test.ts'), false);
  assert.equal(safePath('apps/foo/../bar.test.ts'), false);
});

test('parseJsonc accepts comments and trailing commas', () => {
  assert.deepEqual(parseJsonc('{"a": 1, // x\n "b": [2,],}'), {
    a: 1,
    b: [2],
  });
});

test('primarySubject prefers the longest filename prefix, then unique imports', () => {
  assert.equal(
    primarySubject('apps/foo/src/github-extra.test.ts', [
      'apps/foo/src/git.ts',
      'apps/foo/src/github.ts',
    ]),
    'apps/foo/src/github.ts',
  );
  assert.equal(
    primarySubject('apps/foo/src/no-match.test.ts', ['apps/foo/src/other.ts']),
    'apps/foo/src/other.ts',
  );
});

test('collectScopes groups sibling coverage tests around their production subject', async () => {
  const root = await fixture();
  try {
    const scopes = collectScopes(root);
    const github = scopes.find(
      (scope) => scope.key === 'apps/foo/src/github.ts',
    );
    assert.ok(github);
    assert.deepEqual(github.files, [
      'apps/foo/src/github-coverage.test.ts',
      'apps/foo/src/github.test.ts',
    ]);
    assert.deepEqual(github.relatedPaths, [
      'apps/foo/src/github.ts',
      'apps/foo/tests/helpers.ts',
    ]);
    assert.equal(github.risk.coverageNamed, 1);
    assert.match(github.commands.test, /exec vitest run/u);
    assert.match(
      github.commands.coverage,
      /--coverage\.include='src\/github\.ts'/u,
    );
    assert.match(github.commands.coverage, /--coverage\.thresholds\.lines=0/u);

    const standalone = scopes.find(
      (scope) => scope.key === 'apps/foo/src/standalone.test.ts',
    );
    assert.ok(standalone);
    assert.deepEqual(standalone.relatedPaths, []);

    const ambiguous = scopes.find(
      (scope) => scope.key === 'apps/foo/src/ambiguous.test.ts',
    );
    assert.ok(ambiguous);
    assert.deepEqual(ambiguous.relatedPaths, [
      'apps/foo/src/github.ts',
      'apps/foo/src/other.ts',
    ]);

    const python = scopes.find(
      (scope) =>
        scope.key === 'apps/analytics-engine/src/services/calculator.py',
    );
    assert.ok(python);
    assert.deepEqual(python.files, [
      'apps/analytics-engine/tests/test_calculator.py',
    ]);
    assert.deepEqual(python.relatedPaths, [
      'apps/analytics-engine/src/services/calculator.py',
    ]);
    assert.match(python.commands.test, /exec uv run pytest/u);
    assert.match(
      python.commands.coverage,
      /--cov='src\.services\.calculator'/u,
    );
    assert.match(python.commands.coverage, /--cov-fail-under=0/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('fingerprints read content from the requested git ref', async () => {
  const root = await fixture();
  try {
    const first = git(root, 'rev-parse', 'HEAD');
    const before = fingerprintPaths(root, first, ['apps/foo/src/github.ts']);
    await writeFile(
      join(root, 'apps/foo/src/github.ts'),
      'export const value = 9;\n',
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'change');
    const second = git(root, 'rev-parse', 'HEAD');
    const after = fingerprintPaths(root, second, ['apps/foo/src/github.ts']);
    assert.notEqual(before, after);
    assert.equal(
      fingerprintPaths(root, first, ['apps/foo/src/github.ts']),
      before,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

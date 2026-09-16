import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  compressRanges,
  generateCoverageHandoff,
  parseCobertura,
  parseIstanbulFile,
} from './coverage-handoff.ts';

describe('compressRanges', () => {
  it('compresses empty, singleton, contiguous, duplicate and unsorted lines', () => {
    assert.deepEqual(compressRanges([]), []);
    assert.deepEqual(compressRanges([7]), ['7']);
    assert.deepEqual(compressRanges([1, 2]), ['1-2']);
    assert.deepEqual(compressRanges([11, 2, 1, 10, 8, 3, 2]), [
      '1-3',
      '8',
      '10-11',
    ]);
  });
});

describe('Istanbul parser', () => {
  it('returns exact uncovered statement lines, branch lines and function lines', () => {
    const file = parseIstanbulFile('/repo/apps/foo', '/repo/apps/foo/src/foo.ts', {
      path: '/repo/apps/foo/src/foo.ts',
      statementMap: {
        '0': { start: { line: 10 }, end: { line: 10 } },
        '1': { start: { line: 20 }, end: { line: 20 } },
        '2': { start: { line: 20 }, end: { line: 20 } },
        '3': { start: { line: 30 }, end: { line: 30 } },
      },
      s: { '0': 1, '1': 0, '2': 0, '3': 2 },
      fnMap: {
        '0': { decl: { start: { line: 40 }, end: { line: 40 } } },
        '1': { decl: { start: { line: 50 }, end: { line: 50 } } },
      },
      f: { '0': 1, '1': 0 },
      branchMap: {
        '0': { line: 60, locations: [] },
        '1': { line: 70, locations: [] },
      },
      b: { '0': [1, 0], '1': [2, 3] },
    });

    assert.equal(file.path, 'src/foo.ts');
    assert.deepEqual(file.uncoveredLineRanges, ['20']);
    assert.deepEqual(file.uncoveredBranchLines, [60]);
    assert.deepEqual(file.uncoveredFunctionLines, [50]);
    assert.deepEqual(file.metrics.lines, { total: 3, covered: 2, pct: 66.67 });
    assert.deepEqual(file.metrics.branches, { total: 4, covered: 3, pct: 75 });
    assert.deepEqual(file.metrics.functions, { total: 2, covered: 1, pct: 50 });
  });
});

describe('Cobertura parser', () => {
  it('extracts uncovered lines and supported branch data without inventing functions', () => {
    const files = parseCobertura(`<?xml version="1.0" ?>
<coverage>
  <packages><package><classes>
    <class name="foo" filename="src/foo.py">
      <lines>
        <line number="7" hits="1"/>
        <line number="8" hits="0"/>
        <line number="9" hits="1" branch="true" condition-coverage="50% (1/2)"/>
      </lines>
    </class>
  </classes></package></packages>
</coverage>`);

    assert.equal(files.length, 1);
    assert.equal(files[0]?.path, 'src/foo.py');
    assert.deepEqual(files[0]?.uncoveredLineRanges, ['8']);
    assert.deepEqual(files[0]?.uncoveredBranchLines, [9]);
    assert.equal(files[0]?.metrics.functions, null);
    assert.equal(files[0]?.metrics.statements, null);
    assert.deepEqual(files[0]?.metrics.lines, { total: 3, covered: 2, pct: 66.67 });
    assert.deepEqual(files[0]?.metrics.branches, { total: 2, covered: 1, pct: 50 });
  });
});

describe('generateCoverageHandoff', () => {
  it('filters 100% files, surfaces missing reports, and stays partial', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'coverage-handoff-'));
    try {
      for (const workspace of ['foo', 'missing']) {
        await mkdir(join(repo, 'apps', workspace), { recursive: true });
        await writeFile(
          join(repo, 'apps', workspace, 'package.json'),
          JSON.stringify({ scripts: { 'test:coverage': 'vitest run --coverage' } }),
        );
      }
      await mkdir(join(repo, 'apps', 'foo', 'coverage'), { recursive: true });
      await mkdir(join(repo, 'coverage'), { recursive: true });
      await writeFile(
        join(repo, 'coverage', 'summary.json'),
        JSON.stringify({
          total: {
            statements: { total: 4, covered: 3, pct: 75 },
            branches: { total: 2, covered: 1, pct: 50 },
            functions: { total: 2, covered: 1, pct: 50 },
            lines: { total: 4, covered: 3, pct: 75 },
          },
          workspaces: [{ name: 'apps/foo' }],
        }),
      );
      await writeFile(
        join(repo, 'apps', 'foo', 'coverage', 'coverage-final.json'),
        JSON.stringify({
          '/repo/apps/foo/src/complete.ts': {
            path: join(repo, 'apps', 'foo', 'src', 'complete.ts'),
            statementMap: {
              '0': { start: { line: 1 }, end: { line: 1 } },
            },
            s: { '0': 1 },
            fnMap: {},
            f: {},
            branchMap: {},
            b: {},
          },
          '/repo/apps/foo/src/incomplete.ts': {
            path: join(repo, 'apps', 'foo', 'src', 'incomplete.ts'),
            statementMap: {
              '0': { start: { line: 10 }, end: { line: 10 } },
              '1': { start: { line: 11 }, end: { line: 11 } },
            },
            s: { '0': 1, '1': 0 },
            fnMap: {
              '0': { decl: { start: { line: 20 }, end: { line: 20 } } },
            },
            f: { '0': 0 },
            branchMap: {
              '0': { line: 30, locations: [] },
            },
            b: { '0': [1, 0] },
          },
        }),
      );

      const handoff = await generateCoverageHandoff(repo, {
        GITHUB_SHA: 'abc123',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_RUN_ID: '42',
        GITHUB_RUN_ATTEMPT: '1',
      });

      assert.equal(handoff.reportStatus, 'partial');
      assert.deepEqual(handoff.missingReports, ['apps/missing']);
      assert.equal(handoff.incompleteWorkspaces.length, 1);
      assert.equal(handoff.incompleteWorkspaces[0]?.name, 'apps/foo');
      assert.deepEqual(
        handoff.incompleteWorkspaces[0]?.files.map((file) => file.path),
        ['src/incomplete.ts'],
      );
      assert.deepEqual(handoff.incompleteWorkspaces[0]?.metrics.lines, {
        total: 3,
        covered: 2,
        pct: 66.67,
      });
      assert.equal(handoff.git.sha, 'abc123');
      assert.equal(handoff.github.runId, '42');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

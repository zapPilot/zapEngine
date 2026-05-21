import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  summarizeWorkspaces,
  loadIstanbulSummary,
  loadPytestCoverage,
  type WorkspaceCoverage,
} from './coverage-summary.ts';

describe('summarizeWorkspaces', () => {
  it('returns weighted monorepo totals across workspaces', () => {
    const workspaces: WorkspaceCoverage[] = [
      {
        name: 'apps/account-engine',
        statements: { total: 100, covered: 90, pct: 90 },
        branches: { total: 50, covered: 40, pct: 80 },
        functions: { total: 20, covered: 18, pct: 90 },
        lines: { total: 100, covered: 90, pct: 90 },
      },
      {
        name: 'packages/intent-engine',
        statements: { total: 200, covered: 180, pct: 90 },
        branches: { total: 100, covered: 70, pct: 70 },
        functions: { total: 40, covered: 36, pct: 90 },
        lines: { total: 200, covered: 180, pct: 90 },
      },
    ];

    const summary = summarizeWorkspaces(workspaces);

    assert.equal(summary.workspaces.length, 2);
    // Weighted: (90+180) / (100+200) = 270/300 = 90
    assert.equal(summary.total.lines.pct, 90);
    // (40+70) / (50+100) = 110/150 = 73.33...
    assert.equal(Math.round(summary.total.branches.pct * 100) / 100, 73.33);
  });

  it('handles a single workspace', () => {
    const summary = summarizeWorkspaces([
      {
        name: 'packages/types',
        statements: { total: 10, covered: 9, pct: 90 },
        branches: { total: 5, covered: 4, pct: 80 },
        functions: { total: 4, covered: 4, pct: 100 },
        lines: { total: 10, covered: 9, pct: 90 },
      },
    ]);

    assert.equal(summary.workspaces.length, 1);
    assert.equal(summary.total.lines.pct, 90);
    assert.equal(summary.total.functions.pct, 100);
  });

  it('handles empty workspace list with zero totals', () => {
    const summary = summarizeWorkspaces([]);
    assert.equal(summary.workspaces.length, 0);
    assert.equal(summary.total.lines.pct, 0);
    assert.equal(summary.total.lines.total, 0);
  });

  it('treats workspace with zero LOC as 100% (vacuous), not NaN', () => {
    const summary = summarizeWorkspaces([
      {
        name: 'packages/empty',
        statements: { total: 0, covered: 0, pct: 100 },
        branches: { total: 0, covered: 0, pct: 100 },
        functions: { total: 0, covered: 0, pct: 100 },
        lines: { total: 0, covered: 0, pct: 100 },
      },
    ]);
    assert.equal(summary.total.lines.pct, 100);
    assert.equal(Number.isFinite(summary.total.lines.pct), true);
  });
});

describe('loadIstanbulSummary', () => {
  it('parses an istanbul/v8 coverage-summary.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cov-summary-'));
    try {
      const summaryPath = join(dir, 'coverage-summary.json');
      await writeFile(
        summaryPath,
        JSON.stringify({
          total: {
            statements: { total: 100, covered: 75, skipped: 0, pct: 75 },
            branches: { total: 50, covered: 30, skipped: 0, pct: 60 },
            functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
            lines: { total: 100, covered: 75, skipped: 0, pct: 75 },
          },
          'src/foo.ts': {
            statements: { total: 50, covered: 40, skipped: 0, pct: 80 },
          },
        }),
        'utf8',
      );

      const cov = await loadIstanbulSummary(summaryPath, 'apps/example');

      assert.equal(cov.name, 'apps/example');
      assert.equal(cov.statements.pct, 75);
      assert.equal(cov.branches.pct, 60);
      assert.equal(cov.functions.pct, 90);
      assert.equal(cov.lines.total, 100);
      assert.equal(cov.lines.covered, 75);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns null when the file is missing', async () => {
    const cov = await loadIstanbulSummary(
      '/nonexistent/coverage-summary.json',
      'apps/missing',
    );
    assert.equal(cov, null);
  });
});

describe('loadPytestCoverage', () => {
  it('parses pytest-cov Cobertura coverage.xml', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cov-pytest-'));
    try {
      const xmlPath = join(dir, 'coverage.xml');
      await writeFile(
        xmlPath,
        `<?xml version="1.0" ?>
<coverage version="7.4.0" timestamp="0" lines-valid="200" lines-covered="190" line-rate="0.95" branches-valid="80" branches-covered="68" branch-rate="0.85" complexity="0">
  <packages></packages>
</coverage>`,
        'utf8',
      );

      const cov = await loadPytestCoverage(xmlPath, 'apps/analytics-engine');

      assert.equal(cov?.name, 'apps/analytics-engine');
      assert.equal(cov?.lines.total, 200);
      assert.equal(cov?.lines.covered, 190);
      assert.equal(cov?.lines.pct, 95);
      assert.equal(cov?.branches.total, 80);
      assert.equal(cov?.branches.covered, 68);
      assert.equal(cov?.branches.pct, 85);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns null when coverage.xml is missing', async () => {
    const cov = await loadPytestCoverage(
      '/nonexistent/coverage.xml',
      'apps/analytics-engine',
    );
    assert.equal(cov, null);
  });
});

describe('discoverAndSummarize (integration)', () => {
  it('walks a synthetic repo, picks up TS + Python reports, writes summary.json', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'cov-repo-'));
    try {
      // TS workspace with istanbul report
      await mkdir(join(repo, 'apps', 'foo', 'coverage'), { recursive: true });
      await writeFile(
        join(repo, 'apps', 'foo', 'coverage', 'coverage-summary.json'),
        JSON.stringify({
          total: {
            statements: { total: 100, covered: 80, skipped: 0, pct: 80 },
            branches: { total: 50, covered: 40, skipped: 0, pct: 80 },
            functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
            lines: { total: 100, covered: 80, skipped: 0, pct: 80 },
          },
        }),
      );
      // Python (analytics-engine) Cobertura report
      await mkdir(join(repo, 'apps', 'analytics-engine', 'htmlcov'), {
        recursive: true,
      });
      await writeFile(
        join(repo, 'apps', 'analytics-engine', 'htmlcov', 'coverage.xml'),
        `<?xml version="1.0" ?>
<coverage lines-valid="100" lines-covered="95" line-rate="0.95" branches-valid="0" branches-covered="0" branch-rate="0"></coverage>`,
      );

      const { discoverAndSummarize } = await import('./coverage-summary.ts');
      const summary = await discoverAndSummarize(repo);

      const names = summary.workspaces.map((w) => w.name).sort();
      assert.deepEqual(names, ['apps/analytics-engine', 'apps/foo']);
      // Weighted lines: (80+95)/(100+100) = 87.5
      assert.equal(summary.total.lines.pct, 87.5);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

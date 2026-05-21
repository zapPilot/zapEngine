#!/usr/bin/env tsx
// Aggregator for per-workspace coverage reports into a single monorepo
// summary at `coverage/summary.json`. Pure Node + tsx (no external deps).
//
// Supports two input formats:
//   - Istanbul/v8 `coverage-summary.json` (every TS workspace via vitest)
//   - Cobertura `coverage.xml` (analytics-engine via pytest-cov)
//
// Run via `pnpm tsx scripts/coverage-summary.ts` from the zapEngine root.

import { promises as fs } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

export interface MetricTotals {
  total: number;
  covered: number;
  pct: number;
}

export interface WorkspaceCoverage {
  name: string;
  statements: MetricTotals;
  branches: MetricTotals;
  functions: MetricTotals;
  lines: MetricTotals;
}

export interface MonorepoSummary {
  generatedAt: string;
  workspaces: WorkspaceCoverage[];
  total: Omit<WorkspaceCoverage, 'name'>;
}

// Workspace roots we walk to discover coverage reports. Discovery is
// directory-based (not a hardcoded list) so new workspaces are picked up
// automatically and synthetic fixture trees work in tests.
const WORKSPACE_ROOTS = ['apps', 'packages'] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(covered: number, total: number): number {
  if (total === 0) return 100;
  return round2((covered / total) * 100);
}

export function summarizeWorkspaces(
  workspaces: WorkspaceCoverage[],
): MonorepoSummary {
  const metrics = ['statements', 'branches', 'functions', 'lines'] as const;
  const total = {} as Omit<WorkspaceCoverage, 'name'>;

  for (const m of metrics) {
    const sumTotal = workspaces.reduce((acc, w) => acc + w[m].total, 0);
    const sumCovered = workspaces.reduce((acc, w) => acc + w[m].covered, 0);
    // Empty workspace list = "no data reported" → 0%, NOT vacuous 100%.
    // A workspace with zero LOC is the vacuous case and uses pct(0, 0)=100.
    const totalPct = workspaces.length === 0 ? 0 : pct(sumCovered, sumTotal);
    total[m] = {
      total: sumTotal,
      covered: sumCovered,
      pct: totalPct,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    workspaces,
    total,
  };
}

export async function loadIstanbulSummary(
  filePath: string,
  name: string,
): Promise<WorkspaceCoverage | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return null;
    }
    throw err;
  }
  const json = JSON.parse(raw) as {
    total: Record<string, { total: number; covered: number; pct: number }>;
  };
  const t = json.total;
  return {
    name,
    statements: {
      total: t.statements.total,
      covered: t.statements.covered,
      pct: t.statements.pct,
    },
    branches: {
      total: t.branches.total,
      covered: t.branches.covered,
      pct: t.branches.pct,
    },
    functions: {
      total: t.functions.total,
      covered: t.functions.covered,
      pct: t.functions.pct,
    },
    lines: {
      total: t.lines.total,
      covered: t.lines.covered,
      pct: t.lines.pct,
    },
  };
}

export async function loadPytestCoverage(
  filePath: string,
  name: string,
): Promise<WorkspaceCoverage | null> {
  let xml: string;
  try {
    xml = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return null;
    }
    throw err;
  }
  // Cobertura format: <coverage lines-valid="N" lines-covered="N"
  // line-rate="0.95" branches-valid="N" branches-covered="N" branch-rate="0.85">
  const attr = (key: string): number => {
    const m = xml.match(new RegExp(`${key}="([0-9.]+)"`));
    return m ? Number(m[1]) : 0;
  };
  const linesTotal = attr('lines-valid');
  const linesCovered = attr('lines-covered');
  const branchesTotal = attr('branches-valid');
  const branchesCovered = attr('branches-covered');
  return {
    name,
    // pytest-cov doesn't separate statements from lines in Cobertura — mirror lines
    statements: {
      total: linesTotal,
      covered: linesCovered,
      pct: pct(linesCovered, linesTotal),
    },
    branches: {
      total: branchesTotal,
      covered: branchesCovered,
      pct: pct(branchesCovered, branchesTotal),
    },
    // Cobertura emitted by coverage.py doesn't surface function counts
    functions: { total: 0, covered: 0, pct: 100 },
    lines: {
      total: linesTotal,
      covered: linesCovered,
      pct: pct(linesCovered, linesTotal),
    },
  };
}

async function listSubdirs(parent: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(parent, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export async function discoverAndSummarize(
  repoRoot: string,
): Promise<MonorepoSummary> {
  const found: WorkspaceCoverage[] = [];

  for (const root of WORKSPACE_ROOTS) {
    const subdirs = await listSubdirs(join(repoRoot, root));
    for (const sub of subdirs) {
      const wsName = `${root}/${sub}`;
      const istanbulPath = join(
        repoRoot,
        wsName,
        'coverage',
        'coverage-summary.json',
      );
      const istanbul = await loadIstanbulSummary(istanbulPath, wsName);
      if (istanbul) {
        found.push(istanbul);
        continue;
      }
      // Fallback: pytest-cov Cobertura at htmlcov/coverage.xml or coverage.xml.
      for (const rel of ['htmlcov/coverage.xml', 'coverage.xml']) {
        const pytest = await loadPytestCoverage(
          join(repoRoot, wsName, rel),
          wsName,
        );
        if (pytest) {
          found.push(pytest);
          break;
        }
      }
    }
  }

  return summarizeWorkspaces(found);
}

async function main(): Promise<void> {
  const repoRoot = resolve(process.cwd());
  const summary = await discoverAndSummarize(repoRoot);
  const outPath = join(repoRoot, 'coverage', 'summary.json');
  await fs.mkdir(dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  console.log(`Coverage summary → ${relative(repoRoot, outPath)}`);
  console.log(
    `Workspaces: ${summary.workspaces.length}  |  Lines: ${summary.total.lines.pct}%  |  Branches: ${summary.total.branches.pct}%`,
  );
  for (const w of summary.workspaces) {
    console.log(
      `  ${w.name.padEnd(28)}  lines=${w.lines.pct}%  branches=${w.branches.pct}%  funcs=${w.functions.pct}%`,
    );
  }

  if (summary.workspaces.length === 0) {
    console.error(
      'No coverage reports found. Run `pnpm test:coverage` first.',
    );
    process.exitCode = 1;
  }
}

// CLI entry: only run when invoked directly as a script (not when imported
// by the test file or another module). Use basename to disambiguate from
// `coverage-summary.test.ts`.
const isMainModule =
  !!process.argv[1] && basename(process.argv[1]) === 'coverage-summary.ts';
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

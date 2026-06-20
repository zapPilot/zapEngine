#!/usr/bin/env tsx
// Coverage no-regression gate. Reads `coverage/summary.json` (current run) vs
// `coverage/baseline.json` (committed baseline) and exits non-zero if any
// workspace regressed on lines, branches, or functions by more than that
// metric's threshold (see METRIC_THRESHOLDS_PP).
//
// Companion to `scripts/coverage-summary.ts`; wired via the root
// `pnpm coverage check` script.

import { promises as fs } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export const MONITORED_METRICS = ['lines', 'branches', 'functions'] as const;
export type MonitoredMetric = (typeof MONITORED_METRICS)[number];

// Per-metric regression thresholds (percentage points). Branches and functions
// swing more than lines on small workspaces (one new untested branch can move
// the % by several points), so they get more headroom to avoid false alarms.
export const METRIC_THRESHOLDS_PP: Record<MonitoredMetric, number> = {
  lines: 0.3,
  branches: 0.75,
  functions: 0.5,
};

// Historical headline threshold (= the lines threshold). Still referenced by
// scripts/COVERAGE.md and the `pnpm coverage check` docs.
export const REGRESSION_THRESHOLD_PP = METRIC_THRESHOLDS_PP.lines;

export interface MetricTotals {
  total: number;
  covered: number;
  pct: number;
}

export interface WorkspaceCoverageInput {
  name: string;
  statements: MetricTotals;
  branches: MetricTotals;
  functions: MetricTotals;
  lines: MetricTotals;
}

export interface MonorepoSummaryInput {
  workspaces: WorkspaceCoverageInput[];
  total: Omit<WorkspaceCoverageInput, 'name'>;
}

export interface Regression {
  workspace: string;
  metric: MonitoredMetric;
  baselinePct: number;
  currentPct: number | null;
  deltaPp: number;
}

export function detectRegressions(
  current: MonorepoSummaryInput,
  baseline: MonorepoSummaryInput,
): Regression[] {
  const regressions: Regression[] = [];
  const currentByName = new Map(current.workspaces.map((w) => [w.name, w]));

  for (const baseWs of baseline.workspaces) {
    const curWs = currentByName.get(baseWs.name);
    if (!curWs) {
      // Workspace disappeared from the current run while baseline had data.
      // Emit one canonical (lines) regression rather than one per metric.
      regressions.push({
        workspace: baseWs.name,
        metric: 'lines',
        baselinePct: baseWs.lines.pct,
        currentPct: null,
        deltaPp: -baseWs.lines.pct,
      });
      continue;
    }
    for (const metric of MONITORED_METRICS) {
      const delta = curWs[metric].pct - baseWs[metric].pct;
      if (delta < -METRIC_THRESHOLDS_PP[metric]) {
        regressions.push({
          workspace: baseWs.name,
          metric,
          baselinePct: baseWs[metric].pct,
          currentPct: curWs[metric].pct,
          deltaPp: delta,
        });
      }
    }
  }
  return regressions;
}

function formatPct(pct: number | null): string {
  return pct === null ? '—' : `${pct.toFixed(2)}%`;
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(2)}`;
}

export function formatMarkdownReport(
  current: MonorepoSummaryInput,
  baseline: MonorepoSummaryInput,
  regressions: Regression[],
): string {
  const lines: string[] = [];
  if (regressions.length === 0) {
    lines.push('## ✅ No coverage regressions');
  } else {
    lines.push('## ❌ Coverage regression detected');
    lines.push('');
    lines.push('| Workspace | Metric | Baseline | Current | Δ (pp) |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const r of regressions) {
      lines.push(
        `| \`${r.workspace}\` | ${r.metric} | ${formatPct(r.baselinePct)} | ${formatPct(r.currentPct)} | ${formatDelta(r.deltaPp)} |`,
      );
    }
    lines.push('');
  }

  // Full per-workspace table for context
  lines.push('');
  lines.push('### Per-workspace lines coverage');
  lines.push('');
  lines.push('| Workspace | Baseline | Current | Δ (pp) |');
  lines.push('| --- | --- | --- | --- |');
  const baselineByName = new Map(baseline.workspaces.map((w) => [w.name, w]));
  const allNames = new Set<string>([
    ...baseline.workspaces.map((w) => w.name),
    ...current.workspaces.map((w) => w.name),
  ]);
  for (const name of [...allNames].sort()) {
    const b = baselineByName.get(name);
    const c = current.workspaces.find((w) => w.name === name);
    const bp = b ? b.lines.pct : null;
    const cp = c ? c.lines.pct : null;
    const delta = bp !== null && cp !== null ? cp - bp : 0;
    lines.push(
      `| \`${name}\` | ${formatPct(bp)} | ${formatPct(cp)} | ${formatDelta(delta)} |`,
    );
  }
  return lines.join('\n') + '\n';
}

async function readSummary(path: string): Promise<MonorepoSummaryInput> {
  const raw = await fs.readFile(path, 'utf8');
  return JSON.parse(raw) as MonorepoSummaryInput;
}

async function loadOrExit(
  path: string,
  errMsg: string,
): Promise<MonorepoSummaryInput> {
  try {
    return await readSummary(path);
  } catch {
    console.error(errMsg);
    process.exit(2);
    // process.exit returns `never` in node, but if a test harness stubs it,
    // make the type honest by throwing instead of returning undefined.
    throw new Error(errMsg);
  }
}

async function main(): Promise<void> {
  const repoRoot = resolve(process.cwd());
  const currentPath = join(repoRoot, 'coverage', 'summary.json');
  const baselinePath = join(repoRoot, 'coverage', 'baseline.json');

  const current = await loadOrExit(
    currentPath,
    `Missing ${currentPath}. Run \`pnpm coverage summary\` first.`,
  );
  const baseline = await loadOrExit(
    baselinePath,
    `Missing ${baselinePath}. Commit a baseline first (see scripts/COVERAGE.md).`,
  );

  const regressions = detectRegressions(current, baseline);
  const report = formatMarkdownReport(current, baseline, regressions);
  console.log(report);

  if (regressions.length > 0) {
    process.exit(1);
  }
}

const isMainModule =
  !!process.argv[1] && basename(process.argv[1]) === 'coverage-regression.ts';
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

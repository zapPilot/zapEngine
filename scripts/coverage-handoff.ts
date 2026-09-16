#!/usr/bin/env tsx

import { promises as fs } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

export type MetricName = 'statements' | 'branches' | 'functions' | 'lines';

export interface MetricTotals {
  total: number;
  covered: number;
  pct: number;
}

export type HandoffMetrics = Record<MetricName, MetricTotals | null>;

export interface HandoffFile {
  path: string;
  metrics: HandoffMetrics;
  uncoveredLineRanges: string[];
  uncoveredBranchLines: number[];
  uncoveredFunctionLines: number[];
}

export interface HandoffWorkspace {
  name: string;
  metrics: HandoffMetrics;
  files: HandoffFile[];
}

interface SummaryJson {
  workspaces?: Array<{ name: string }>;
  total?: Record<MetricName, MetricTotals>;
}

interface IstanbulLocation {
  start: { line: number; column?: number };
  end?: { line: number; column?: number };
}

interface IstanbulFileCoverage {
  path?: string;
  statementMap?: Record<string, IstanbulLocation>;
  fnMap?: Record<string, { decl?: IstanbulLocation; loc?: IstanbulLocation }>;
  branchMap?: Record<
    string,
    {
      line?: number;
      loc?: IstanbulLocation;
      locations?: IstanbulLocation[];
    }
  >;
  s?: Record<string, number>;
  f?: Record<string, number>;
  b?: Record<string, number[]>;
}

interface LoadedWorkspace {
  metrics: HandoffMetrics;
  files: HandoffFile[];
  empty: boolean;
}

export interface CoverageHandoff {
  schemaVersion: 1;
  generatedAt: string;
  reportStatus: 'complete' | 'partial' | 'unavailable';
  missingReports: string[];
  emptyWorkspaces: string[];
  reportErrors: Array<{ workspace: string; reason: string }>;
  git: { sha: string | null; ref: string | null };
  github: { runId: string | null; runAttempt: string | null };
  total: Record<MetricName, MetricTotals> | null;
  incompleteWorkspaces: HandoffWorkspace[];
}

const WORKSPACE_ROOTS = ['apps', 'packages'] as const;
const METRICS: MetricName[] = ['statements', 'branches', 'functions', 'lines'];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function metric(total: number, covered: number): MetricTotals {
  return {
    total,
    covered,
    pct: total === 0 ? 100 : round2((covered / total) * 100),
  };
}

function missingCount(value: MetricTotals | null): number {
  return value ? value.total - value.covered : -1;
}

function compareMetrics(
  a: { metrics: HandoffMetrics },
  b: { metrics: HandoffMetrics },
): number {
  for (const name of ['lines', 'branches', 'functions', 'statements'] as const) {
    const diff = missingCount(b.metrics[name]) - missingCount(a.metrics[name]);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isIncomplete(metrics: HandoffMetrics): boolean {
  return METRICS.some((name) => {
    const value = metrics[name];
    return value !== null && value.pct < 100;
  });
}

export function compressRanges(values: number[]): string[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const out: string[] = [];
  let start = sorted[0]!;
  let end = start;

  const flush = (): void => {
    out.push(start === end ? String(start) : `${start}-${end}`);
  };

  for (const value of sorted.slice(1)) {
    if (value === end + 1) {
      end = value;
      continue;
    }
    flush();
    start = value;
    end = value;
  }
  flush();
  return out;
}

function aggregateMetrics(files: HandoffFile[]): HandoffMetrics {
  const result = {} as HandoffMetrics;
  for (const name of METRICS) {
    const supported = files
      .map((file) => file.metrics[name])
      .filter((value): value is MetricTotals => value !== null);
    if (supported.length === 0) {
      result[name] = null;
      continue;
    }
    result[name] = metric(
      supported.reduce((sum, value) => sum + value.total, 0),
      supported.reduce((sum, value) => sum + value.covered, 0),
    );
  }
  return result;
}

function normalizeWorkspacePath(workspaceRoot: string, filePath: string): string {
  const normalized = isAbsolute(filePath)
    ? relative(workspaceRoot, filePath)
    : filePath;
  return normalized.replaceAll('\\', '/').replace(/^\.\//, '');
}

function statementLineCounts(file: IstanbulFileCoverage): Map<number, number> {
  const lineCounts = new Map<number, number>();
  const statementMap = file.statementMap ?? {};
  const counts = file.s ?? {};
  for (const [id, location] of Object.entries(statementMap)) {
    const line = location.start.line;
    lineCounts.set(line, Math.max(lineCounts.get(line) ?? 0, counts[id] ?? 0));
  }
  return lineCounts;
}

export function parseIstanbulFile(
  workspaceRoot: string,
  key: string,
  file: IstanbulFileCoverage,
): HandoffFile {
  const statements = Object.values(file.s ?? {});
  const functions = Object.values(file.f ?? {});
  const branches = Object.values(file.b ?? {}).flat();
  const lines = statementLineCounts(file);

  const uncoveredBranchLines = Object.entries(file.b ?? {})
    .filter(([, counts]) => counts.some((count) => count === 0))
    .map(([id]) => {
      const branch = file.branchMap?.[id];
      return (
        branch?.line ??
        branch?.loc?.start.line ??
        branch?.locations?.[0]?.start.line ??
        0
      );
    })
    .filter((line) => line > 0);

  const uncoveredFunctionLines = Object.entries(file.f ?? {})
    .filter(([, count]) => count === 0)
    .map(([id]) => {
      const fn = file.fnMap?.[id];
      return fn?.decl?.start.line ?? fn?.loc?.start.line ?? 0;
    })
    .filter((line) => line > 0);

  const uncoveredLines = [...lines.entries()]
    .filter(([, count]) => count === 0)
    .map(([line]) => line);

  return {
    path: normalizeWorkspacePath(workspaceRoot, file.path ?? key),
    metrics: {
      statements: metric(
        statements.length,
        statements.filter((count) => count > 0).length,
      ),
      branches: metric(
        branches.length,
        branches.filter((count) => count > 0).length,
      ),
      functions: metric(
        functions.length,
        functions.filter((count) => count > 0).length,
      ),
      lines: metric(
        lines.size,
        [...lines.values()].filter((count) => count > 0).length,
      ),
    },
    uncoveredLineRanges: compressRanges(uncoveredLines),
    uncoveredBranchLines: [...new Set(uncoveredBranchLines)].sort((a, b) => a - b),
    uncoveredFunctionLines: [...new Set(uncoveredFunctionLines)].sort(
      (a, b) => a - b,
    ),
  };
}

function xmlAttr(source: string, name: string): string | null {
  const match = source.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match?.[1] ?? null;
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

export function parseCobertura(xml: string): HandoffFile[] {
  const files: HandoffFile[] = [];
  const classPattern = /<class\b([^>]*)>([\s\S]*?)<\/class>/g;

  for (const match of xml.matchAll(classPattern)) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    const filename = xmlAttr(attrs, 'filename');
    if (!filename) continue;

    const uncoveredLines: number[] = [];
    const uncoveredBranchLines: number[] = [];
    let lineTotal = 0;
    let lineCovered = 0;
    let branchTotal = 0;
    let branchCovered = 0;

    for (const lineMatch of body.matchAll(/<line\b([^>]*)\/?\s*>/g)) {
      const lineAttrs = lineMatch[1] ?? '';
      const lineNumber = Number(xmlAttr(lineAttrs, 'number') ?? 0);
      const hits = Number(xmlAttr(lineAttrs, 'hits') ?? 0);
      if (lineNumber <= 0) continue;

      lineTotal += 1;
      if (hits > 0) lineCovered += 1;
      else uncoveredLines.push(lineNumber);

      const condition = xmlAttr(lineAttrs, 'condition-coverage');
      const fraction = condition?.match(/\((\d+)\/(\d+)\)/);
      if (fraction) {
        const covered = Number(fraction[1]);
        const total = Number(fraction[2]);
        branchCovered += covered;
        branchTotal += total;
        if (covered < total) uncoveredBranchLines.push(lineNumber);
      }
    }

    files.push({
      path: decodeXml(filename).replaceAll('\\', '/').replace(/^\.\//, ''),
      metrics: {
        statements: null,
        branches: branchTotal > 0 ? metric(branchTotal, branchCovered) : null,
        functions: null,
        lines: metric(lineTotal, lineCovered),
      },
      uncoveredLineRanges: compressRanges(uncoveredLines),
      uncoveredBranchLines: [...new Set(uncoveredBranchLines)].sort(
        (a, b) => a - b,
      ),
      uncoveredFunctionLines: [],
    });
  }

  return files.sort(
    (a, b) => compareMetrics(a, b) || a.path.localeCompare(b.path),
  );
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8')) as T;
  } catch (error) {
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

async function listSubdirs(path: string): Promise<string[]> {
  try {
    return (await fs.readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function discoverCoverageWorkspaces(repoRoot: string): Promise<string[]> {
  const workspaces: string[] = [];
  for (const root of WORKSPACE_ROOTS) {
    for (const subdir of await listSubdirs(join(repoRoot, root))) {
      const name = `${root}/${subdir}`;
      const packageJson = await readJson<{ scripts?: Record<string, string> }>(
        join(repoRoot, name, 'package.json'),
      );
      if (packageJson?.scripts?.['test:coverage']) workspaces.push(name);
    }
  }
  return workspaces.sort();
}

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    try {
      await fs.access(path);
      return path;
    } catch {
      // Try the next supported report location.
    }
  }
  return null;
}

async function loadWorkspaceReport(
  repoRoot: string,
  workspace: string,
): Promise<LoadedWorkspace | null> {
  const workspaceRoot = join(repoRoot, workspace);
  const istanbul = await readJson<Record<string, IstanbulFileCoverage>>(
    join(workspaceRoot, 'coverage', 'coverage-final.json'),
  );
  if (istanbul) {
    const allFiles = Object.entries(istanbul).map(([key, file]) =>
      parseIstanbulFile(workspaceRoot, key, file),
    );
    return {
      metrics: aggregateMetrics(allFiles),
      files: allFiles
        .filter((file) => isIncomplete(file.metrics))
        .sort((a, b) => compareMetrics(a, b) || a.path.localeCompare(b.path)),
      empty: allFiles.length === 0,
    };
  }

  const coberturaPath = await firstExisting([
    join(workspaceRoot, 'coverage.xml'),
    join(workspaceRoot, 'htmlcov', 'coverage.xml'),
  ]);
  if (!coberturaPath) return null;

  const allFiles = parseCobertura(await fs.readFile(coberturaPath, 'utf8'));
  return {
    metrics: aggregateMetrics(allFiles),
    files: allFiles
      .filter((file) => isIncomplete(file.metrics))
      .sort((a, b) => compareMetrics(a, b) || a.path.localeCompare(b.path)),
    empty: allFiles.length === 0,
  };
}

function formatMetric(value: MetricTotals | null): string {
  return value === null ? '—' : `${value.pct}%`;
}

export function renderMarkdown(handoff: CoverageHandoff): string {
  const lines: string[] = [
    '# Coverage Handoff',
    '',
    `Commit: \`${handoff.git.sha ?? 'unknown'}\``,
    `Run: \`${handoff.github.runId ?? 'local'}\``,
    `Report status: **${handoff.reportStatus}**`,
    '',
    'Do not run monorepo-wide coverage before reading this handoff.',
  ];

  if (handoff.missingReports.length > 0) {
    lines.push(
      '',
      `Missing reports: ${handoff.missingReports.map((name) => `\`${name}\``).join(', ')}`,
    );
  }

  lines.push('', '## Remaining coverage', '');
  if (handoff.incompleteWorkspaces.length === 0) {
    lines.push('All reported supported coverage is 100%.');
  } else {
    lines.push(
      '| Workspace | Lines | Branches | Functions | Missing lines |',
      '| --- | ---: | ---: | ---: | ---: |',
    );
    for (const workspace of handoff.incompleteWorkspaces) {
      const missingLines = workspace.metrics.lines
        ? workspace.metrics.lines.total - workspace.metrics.lines.covered
        : '—';
      lines.push(
        `| ${workspace.name} | ${formatMetric(workspace.metrics.lines)} | ${formatMetric(workspace.metrics.branches)} | ${formatMetric(workspace.metrics.functions)} | ${missingLines} |`,
      );
    }
  }

  for (const workspace of handoff.incompleteWorkspaces) {
    lines.push('', `## ${workspace.name}`);
    for (const file of workspace.files) {
      lines.push(
        '',
        `### ${file.path}`,
        `- Lines: ${formatMetric(file.metrics.lines)}`,
        `- Branches: ${formatMetric(file.metrics.branches)}`,
        `- Functions: ${formatMetric(file.metrics.functions)}`,
      );
      if (file.uncoveredLineRanges.length > 0) {
        lines.push(
          `- Uncovered lines: ${file.uncoveredLineRanges.map((range) => `\`${range}\``).join(', ')}`,
        );
      }
      if (file.uncoveredBranchLines.length > 0) {
        lines.push(
          `- Uncovered branch lines: ${file.uncoveredBranchLines.map((line) => `\`${line}\``).join(', ')}`,
        );
      }
      if (file.uncoveredFunctionLines.length > 0) {
        lines.push(
          `- Uncovered function lines: ${file.uncoveredFunctionLines.map((line) => `\`${line}\``).join(', ')}`,
        );
      }
    }
  }

  lines.push(
    '',
    '## Agent workflow',
    '',
    '1. Pick one incomplete workspace or file from this artifact.',
    '2. Inspect the existing implementation and tests.',
    '3. Add meaningful tests for real behavior.',
    '4. During iteration, run only scoped tests / scoped coverage.',
    '5. Do not repeatedly run monorepo-wide coverage.',
    '6. Push the change and let CI recompute canonical coverage.',
    '7. Use the next `coverage-handoff` artifact as the new state.',
    '',
  );
  return lines.join('\n');
}

export async function generateCoverageHandoff(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CoverageHandoff> {
  const summary = await readJson<SummaryJson>(join(repoRoot, 'coverage', 'summary.json'));
  const expected = [
    ...new Set([
      ...(await discoverCoverageWorkspaces(repoRoot)),
      ...(summary?.workspaces ?? []).map((workspace) => workspace.name),
    ]),
  ].sort();

  const incompleteWorkspaces: HandoffWorkspace[] = [];
  const missingReports: string[] = [];
  const emptyWorkspaces: string[] = [];
  const reportErrors: Array<{ workspace: string; reason: string }> = [];
  let foundReports = 0;

  for (const name of expected) {
    try {
      const loaded = await loadWorkspaceReport(repoRoot, name);
      if (!loaded) {
        missingReports.push(name);
        continue;
      }
      foundReports += 1;
      if (loaded.empty) emptyWorkspaces.push(name);
      if (!isIncomplete(loaded.metrics)) continue;
      incompleteWorkspaces.push({
        name,
        metrics: loaded.metrics,
        files: loaded.files,
      });
    } catch (error) {
      missingReports.push(name);
      reportErrors.push({
        workspace: name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  incompleteWorkspaces.sort(
    (a, b) => compareMetrics(a, b) || a.name.localeCompare(b.name),
  );
  missingReports.sort();
  emptyWorkspaces.sort();
  reportErrors.sort((a, b) => a.workspace.localeCompare(b.workspace));

  const reportStatus: CoverageHandoff['reportStatus'] =
    foundReports === 0
      ? 'unavailable'
      : missingReports.length > 0 || summary === null
        ? 'partial'
        : 'complete';

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    reportStatus,
    missingReports,
    emptyWorkspaces,
    reportErrors,
    git: {
      sha: env.GITHUB_SHA ?? null,
      ref: env.GITHUB_REF ?? null,
    },
    github: {
      runId: env.GITHUB_RUN_ID ?? null,
      runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
    },
    total: summary?.total ?? null,
    incompleteWorkspaces,
  };
}

async function main(): Promise<void> {
  const repoRoot = resolve(process.cwd());
  const handoff = await generateCoverageHandoff(repoRoot);
  const coverageDir = join(repoRoot, 'coverage');
  await fs.mkdir(coverageDir, { recursive: true });
  await fs.writeFile(
    join(coverageDir, 'handoff.json'),
    `${JSON.stringify(handoff, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    join(coverageDir, 'HANDOFF.md'),
    renderMarkdown(handoff),
    'utf8',
  );

  console.log('Coverage handoff → coverage/handoff.json');
  console.log('Coverage handoff → coverage/HANDOFF.md');
  console.log(
    `Status: ${handoff.reportStatus}; incomplete=${handoff.incompleteWorkspaces.length}; missing=${handoff.missingReports.length}`,
  );
}

const isMainModule =
  !!process.argv[1] && basename(process.argv[1]) === 'coverage-handoff.ts';
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

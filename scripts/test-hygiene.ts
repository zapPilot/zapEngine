#!/usr/bin/env tsx
// Test-structure scanner per .ai/test-hygiene.md
// Pure Node - no external deps beyond tsx (root devDep). Run from repo root.

import { promises as fs } from 'node:fs';
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

const REPO_ROOT = process.cwd();

const TARGETS = [
  'apps/account-engine',
  'apps/alpha-etl',
  'apps/frontend',
  'apps/landing-page',
  'apps/podcast-pipeline',
  'packages/design-tokens',
  'packages/intent-engine',
  'packages/types',
];

const JS_EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const JS_EXTS_SET = new Set(JS_EXTS);
const TS_SOURCE_EQUIVALENTS = new Map([
  ['.js', ['.ts', '.tsx']],
  ['.jsx', ['.tsx']],
  ['.mjs', ['.mts']],
  ['.cjs', ['.cts']],
]);
const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  '.turbo',
]);

const TEST_RE = /\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SOURCE_ROOTS = ['src', 'lib', 'app'];
const IMPORT_RE = /\bfrom\s+["']([^"']+)["']/g;

type IssueType =
  | 'missing_test'
  | 'trivial_test'
  | 'broken_import'
  | 'risk_pattern';
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface Issue {
  type: IssueType;
  file: string;
  severity: Severity;
  confidence: number;
  description: string;
  suggested_action: string;
}

interface ScanOutput {
  task: 'test-structure-scan';
  summary: { total_issues: number; critical: number };
  items: Issue[];
}

interface PathAliases {
  baseUrl: string;
  paths: Array<{ prefix: string; targets: string[] }>;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && JS_EXTS_SET.has(extname(entry.name))) {
      yield full;
    }
  }
}

async function discover(
  targetRoot: string,
): Promise<{ sources: string[]; tests: string[] }> {
  const sources: string[] = [];
  const tests: string[] = [];
  for await (const f of walk(targetRoot)) {
    if (TEST_RE.test(f)) tests.push(f);
    else sources.push(f);
  }
  return { sources, tests };
}

function stripExt(file: string): string {
  const ext = extname(file);
  return ext ? file.slice(0, -ext.length) : file;
}

function testBaseName(file: string): string {
  return basename(stripExt(file)).replace(/\.(?:test|spec)$/i, '');
}

function ruleColocated(sourceFile: string, testSet: Set<string>): boolean {
  const stem = stripExt(sourceFile);
  for (const ext of JS_EXTS) {
    if (testSet.has(`${stem}.test${ext}`)) return true;
    if (testSet.has(`${stem}.spec${ext}`)) return true;
  }
  return false;
}

function ruleTestsFolder(sourceFile: string, testSet: Set<string>): boolean {
  const dir = dirname(sourceFile);
  const base = basename(stripExt(sourceFile));
  for (const ext of JS_EXTS) {
    if (testSet.has(join(dir, '__tests__', `${base}.test${ext}`))) return true;
    if (testSet.has(join(dir, '__tests__', `${base}.spec${ext}`))) return true;
  }
  return false;
}

function ruleMirroredRoot(
  sourceFile: string,
  testFiles: string[],
  targetRoot: string,
): boolean {
  const relFromTarget = relative(targetRoot, sourceFile);
  const parts = relFromTarget.split(sep);
  const firstSeg = parts[0];
  const trailing = SOURCE_ROOTS.includes(firstSeg) ? parts.slice(1) : parts;
  const baseLower = basename(stripExt(sourceFile)).toLowerCase();
  const trailingDir = trailing.slice(0, -1);

  for (const testFile of testFiles) {
    const testRel = relative(targetRoot, testFile);
    const tParts = testRel.split(sep);
    const rootIdx = tParts.findIndex((p) => p === 'tests' || p === 'test');
    if (rootIdx === -1) continue;
    const tBase = testBaseName(testFile).toLowerCase();
    if (tBase !== baseLower) continue;
    const between = tParts.slice(rootIdx + 1, -1);
    if (trailingDir.length === 0) return true;
    if (between.length < trailingDir.length) continue;
    const tail = between.slice(between.length - trailingDir.length);
    if (tail.join('/').toLowerCase() === trailingDir.join('/').toLowerCase()) {
      return true;
    }
  }
  return false;
}

async function loadAliases(targetRoot: string): Promise<PathAliases | null> {
  const path = join(targetRoot, 'tsconfig.json');
  let text: string;
  try {
    text = await fs.readFile(path, 'utf8');
  } catch {
    return null;
  }
  const stripped = text
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  let cfg: {
    compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
  };
  try {
    cfg = JSON.parse(stripped);
  } catch {
    return null;
  }
  const co = cfg.compilerOptions ?? {};
  const baseUrl = resolve(targetRoot, co.baseUrl ?? '.');
  const paths = Object.entries(co.paths ?? {}).map(([alias, targets]) => ({
    prefix: alias.replace(/\*$/, ''),
    targets: targets.map((t) => t.replace(/\*$/, '')),
  }));
  return { baseUrl, paths };
}

function resolveImport(
  spec: string,
  testFile: string,
  aliases: PathAliases | null,
  targetRoot: string,
): string | null {
  if (spec.startsWith('./') || spec.startsWith('../')) {
    return resolve(dirname(testFile), spec);
  }
  if (aliases) {
    for (const { prefix, targets } of aliases.paths) {
      if (spec.startsWith(prefix)) {
        const suffix = spec.slice(prefix.length);
        const t = targets[0];
        if (t !== undefined) return resolve(aliases.baseUrl, t + suffix);
      }
    }
  }
  if (spec.startsWith('@/')) {
    return resolve(targetRoot, 'src', spec.slice(2));
  }
  return null;
}

function ruleImportGraph(
  sourceFile: string,
  testFiles: string[],
  aliases: PathAliases | null,
  targetRoot: string,
  testFileContents: Map<string, string>,
): boolean {
  const sourceStem = stripExt(sourceFile);
  for (const testFile of testFiles) {
    const content = testFileContents.get(testFile);
    if (content === undefined) continue;
    for (const m of content.matchAll(IMPORT_RE)) {
      const resolved = resolveImport(m[1], testFile, aliases, targetRoot);
      if (!resolved) continue;
      const resolvedStem = stripExt(resolved);
      if (resolvedStem === sourceStem) return true;
      if (
        basename(sourceStem) === 'index' &&
        dirname(sourceStem) === resolvedStem
      ) {
        return true;
      }
    }
  }
  return false;
}

function isMatched(
  sourceFile: string,
  testFiles: string[],
  testSet: Set<string>,
  targetRoot: string,
  aliases: PathAliases | null,
  testFileContents: Map<string, string>,
): boolean {
  if (ruleColocated(sourceFile, testSet)) return true;
  if (ruleTestsFolder(sourceFile, testSet)) return true;
  if (ruleMirroredRoot(sourceFile, testFiles, targetRoot)) return true;
  return ruleImportGraph(
    sourceFile,
    testFiles,
    aliases,
    targetRoot,
    testFileContents,
  );
}

function countExportedFunctions(content: string): number {
  const names = new Set<string>();
  for (const m of content.matchAll(
    /\bexport\s+(?:async\s+)?function\s+(\w+)/g,
  )) {
    names.add(m[1]);
  }
  for (const m of content.matchAll(
    /\bexport\s+const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/g,
  )) {
    names.add(m[1]);
  }
  for (const m of content.matchAll(
    /\bexport\s+const\s+(\w+)\s*=\s*(?:async\s+)?function\b/g,
  )) {
    names.add(m[1]);
  }
  return names.size;
}

function countLOC(content: string): number {
  return content.split('\n').filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('//');
  }).length;
}

function detectMissing(repoRelPath: string, content: string): Issue {
  const loc = countLOC(content);
  const exportedFunctions = countExportedFunctions(content);
  let severity: Severity = 'MEDIUM';
  if (loc > 100 && exportedFunctions >= 2) severity = 'HIGH';
  else if (loc <= 25 || exportedFunctions <= 1) severity = 'LOW';
  return {
    type: 'missing_test',
    file: repoRelPath,
    severity,
    confidence: 0.9,
    description: `No matching test under any of the 4 spec rules (LOC=${loc}, exportedFunctions=${exportedFunctions}).`,
    suggested_action: 'verify coverage exists; add test if confirmed missing',
  };
}

function detectTrivial(repoRelPath: string, content: string): Issue | null {
  const expectCount = [...content.matchAll(/\bexpect\s*\(/g)].length;
  if (expectCount === 0) {
    return {
      type: 'trivial_test',
      file: repoRelPath,
      severity: 'LOW',
      confidence: 0.9,
      description: 'Test file contains zero expect() calls.',
      suggested_action: 'remove or fill empty test',
    };
  }

  const allBlocks = [...content.matchAll(/\b(?:test|it)\s*\(/g)].length;
  const emptyBlockRe =
    /\b(?:test|it)\s*\(\s*(?:`[^`]*`|"[^"]*"|'[^']*')\s*,\s*(?:async\s+)?(?:function\s*\([^)]*\)|\([^)]*\)\s*=>)\s*\{\s*\}/g;
  const emptyBlocks = [...content.matchAll(emptyBlockRe)].length;
  if (allBlocks > 0 && emptyBlocks === allBlocks) {
    return {
      type: 'trivial_test',
      file: repoRelPath,
      severity: 'LOW',
      confidence: 0.7,
      description: `All ${allBlocks} test/it blocks have empty bodies.`,
      suggested_action: 'remove or fill empty test',
    };
  }
  return null;
}

async function detectBroken(
  testFile: string,
  repoRelPath: string,
  content: string,
): Promise<Issue[]> {
  const out: Issue[] = [];
  for (const m of content.matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
    const resolved = resolve(dirname(testFile), spec);
    const resolvedExt = extname(resolved);
    const tsEquivalents = TS_SOURCE_EQUIVALENTS.get(resolvedExt) ?? [];
    const hasJsExtension = JS_EXTS_SET.has(resolvedExt);
    const withoutExt = hasJsExtension
      ? resolved.slice(0, -resolvedExt.length)
      : resolved;
    const candidates = hasJsExtension
      ? [resolved, ...tsEquivalents.map((e) => withoutExt + e)]
      : [
          resolved,
          ...JS_EXTS.map((e) => resolved + e),
          ...JS_EXTS.map((e) => join(resolved, 'index' + e)),
        ];
    let found = false;
    for (const c of candidates) {
      try {
        await fs.access(c);
        found = true;
        break;
      } catch {
        // keep trying
      }
    }
    if (!found) {
      out.push({
        type: 'broken_import',
        file: repoRelPath,
        severity: 'CRITICAL',
        confidence: 0.9,
        description: `Relative import "${spec}" does not resolve to an existing file.`,
        suggested_action: 'fix the broken import path',
      });
    }
  }
  return out;
}

const RISK_RULES: Array<{
  symbol: RegExp;
  name: string;
  mitigations: RegExp[];
}> = [
  {
    symbol: /(^|[^.\w$])(?:setTimeout|setInterval)\s*\(/,
    name: 'setTimeout/setInterval',
    mitigations: [/\b(?:vi|jest|sinon)\.useFakeTimers\s*\(/],
  },
  {
    symbol: /\bMath\.random\b/,
    name: 'Math.random',
    mitigations: [
      /\b(?:vi|jest)\.spyOn\s*\(\s*Math\b[\s\S]*?\.mock(?:ReturnValue|Implementation)/,
      /from\s+["'][^"']*seedrandom[^"']*["']/,
    ],
  },
  {
    symbol: /\bfetch\s*\(|\baxios\./,
    name: 'fetch/axios',
    mitigations: [
      /\b(?:vi|jest)\.mock\s*\(/,
      /from\s+["']msw(?:\/[^"']*)?["']/,
      /from\s+["']nock["']/,
      /\bsetupServer\s*\(/,
    ],
  },
];

function detectRisk(repoRelPath: string, content: string): Issue[] {
  const out: Issue[] = [];
  for (const rule of RISK_RULES) {
    if (!rule.symbol.test(content)) continue;
    if (rule.mitigations.some((re) => re.test(content))) continue;
    out.push({
      type: 'risk_pattern',
      file: repoRelPath,
      severity: 'MEDIUM',
      confidence: 0.9,
      description: `Found ${rule.name} without a recognized mitigation in the same file.`,
      suggested_action: 'add mock or fake timer for the flagged symbol',
    });
  }
  return out;
}

async function scanTarget(targetRel: string): Promise<ScanOutput> {
  const targetRoot = join(REPO_ROOT, targetRel);
  const { sources, tests } = await discover(targetRoot);
  const testSet = new Set(tests);
  const aliases = await loadAliases(targetRoot);

  const testFileContents = new Map<string, string>();
  for (const t of tests) {
    try {
      testFileContents.set(t, await fs.readFile(t, 'utf8'));
    } catch {
      // skip unreadable files
    }
  }

  const items: Issue[] = [];

  for (const src of sources) {
    const repoRel = relative(REPO_ROOT, src);
    let content: string;
    try {
      content = await fs.readFile(src, 'utf8');
    } catch {
      continue;
    }
    const matched = isMatched(
      src,
      tests,
      testSet,
      targetRoot,
      aliases,
      testFileContents,
    );
    if (!matched) items.push(detectMissing(repoRel, content));
  }

  for (const tst of tests) {
    const repoRel = relative(REPO_ROOT, tst);
    const content = testFileContents.get(tst);
    if (content === undefined) continue;
    const trivial = detectTrivial(repoRel, content);
    if (trivial) items.push(trivial);
    items.push(...(await detectBroken(tst, repoRel, content)));
    items.push(...detectRisk(repoRel, content));
  }

  const critical = items.filter((i) => i.severity === 'CRITICAL').length;
  return {
    task: 'test-structure-scan',
    summary: { total_issues: items.length, critical },
    items,
  };
}

async function main(): Promise<void> {
  await fs.mkdir(join(REPO_ROOT, '.todos'), { recursive: true });
  const allItems: Issue[] = [];

  for (const target of TARGETS) {
    const slug = target.replace(/[/\\]/g, '-');
    const output = await scanTarget(target);
    const outPath = join(REPO_ROOT, '.todos', `test-hygiene-${slug}.json`);
    await fs.writeFile(outPath, JSON.stringify(output, null, 2) + '\n');
    console.log(
      `${target}: ${output.summary.total_issues} issues (${output.summary.critical} CRITICAL) -> ${relative(
        REPO_ROOT,
        outPath,
      )}`,
    );
    allItems.push(...output.items);
  }

  const merged: ScanOutput = {
    task: 'test-structure-scan',
    summary: {
      total_issues: allItems.length,
      critical: allItems.filter((i) => i.severity === 'CRITICAL').length,
    },
    items: allItems,
  };
  const mergedPath = join(REPO_ROOT, '.todos', 'test-hygiene.json');
  await fs.writeFile(mergedPath, JSON.stringify(merged, null, 2) + '\n');
  console.log(
    `MERGED: ${merged.summary.total_issues} issues (${merged.summary.critical} CRITICAL) -> ${relative(
      REPO_ROOT,
      mergedPath,
    )}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

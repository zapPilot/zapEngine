#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';

export const STATE_SCHEMA_VERSION = 1;
export const MAX_RECORD_PAYLOAD_BYTES = 60 * 1024;
export const MAX_TEXT_LENGTH = 2_000;
export const GLOBAL_TEST_CONFIGS = Object.freeze([
  'apps/account-engine/vitest.setup.ts',
  'apps/alpha-etl/tests/setup/global-setup.ts',
  'apps/landing-page/vitest.setup.ts',
  'apps/analytics-engine/tests/conftest.py',
  'apps/analytics-engine/tests/integration/conftest.py',
  'apps/analytics-engine/tests/services/conftest.py',
]);

const JS_TEST_RE = /(?:^|\/)[^/]+\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/u;
const PY_TEST_RE = /(?:^|\/)(?:test_[^/]+|[^/]+_test)\.py$/u;
const SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
];
const COVERAGE_NAME_RE =
  /(?:^|[._-])(?:coverage\d*|gaps?|100|sweep)(?:[._-]|$)/iu;
export function safePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 500 &&
    !value.startsWith('/') &&
    !value.endsWith('/') &&
    !value
      .split('/')
      .some((part) => part === '' || part === '.' || part === '..') &&
    !/[\\\r\n\0]/u.test(value)
  );
}

export function parseJsonc(raw) {
  let output = '';
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < raw.length && raw[index] !== '\n') index += 1;
      output += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (
        index < raw.length &&
        !(raw[index] === '*' && raw[index + 1] === '/')
      ) {
        if (raw[index] === '\n') output += '\n';
        index += 1;
      }
      index += 1;
      continue;
    }
    output += char;
  }
  return JSON.parse(
    output.replace(/^\uFEFF/u, '').replace(/,\s*([}\]])/gu, '$1'),
  );
}

function git(repoRoot, args, options = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

const gitBlobCache = new Map();

export function resolveGitRef(repoRoot, ref = 'HEAD') {
  return git(repoRoot, ['rev-parse', ref]).trim();
}

export function listFilesAtRef(repoRoot, ref = 'HEAD') {
  return git(repoRoot, ['ls-tree', '-r', '--name-only', '-z', ref])
    .split('\0')
    .filter(Boolean);
}

function blobCacheKey(repoRoot, ref, filePath) {
  return `${repoRoot}\0${ref}\0${filePath}`;
}

export function readGitFiles(repoRoot, ref, filePaths) {
  const paths = [...new Set(filePaths)];
  for (const filePath of paths) {
    if (!safePath(filePath)) {
      throw new Error(`unsafe repository path: ${filePath}`);
    }
  }

  const missing = paths.filter(
    (filePath) => !gitBlobCache.has(blobCacheKey(repoRoot, ref, filePath)),
  );
  if (missing.length > 0) {
    const input = `${missing.map((filePath) => `${ref}:${filePath}`).join('\n')}\n`;
    const output = execFileSync('git', ['cat-file', '--batch'], {
      cwd: repoRoot,
      input,
      maxBuffer: 128 * 1024 * 1024,
    });
    let offset = 0;
    for (const filePath of missing) {
      const newline = output.indexOf(10, offset);
      if (newline < 0) throw new Error('truncated git cat-file header');
      const header = output.subarray(offset, newline).toString('utf8');
      offset = newline + 1;
      if (header.endsWith(' missing')) {
        throw new Error(`cannot read ${filePath} at ${ref}`);
      }
      const parts = header.split(' ');
      const size = Number(parts.at(-1));
      const type = parts.at(-2);
      if (type !== 'blob' || !Number.isInteger(size) || size < 0) {
        throw new Error(`unexpected git cat-file response for ${filePath}`);
      }
      const end = offset + size;
      if (end > output.length) throw new Error('truncated git cat-file body');
      const content = output.subarray(offset, end).toString('utf8');
      offset = end;
      if (output[offset] === 10) offset += 1;
      gitBlobCache.set(blobCacheKey(repoRoot, ref, filePath), content);
    }
  }

  return new Map(
    paths.map((filePath) => [
      filePath,
      gitBlobCache.get(blobCacheKey(repoRoot, ref, filePath)),
    ]),
  );
}

export function readGitFile(repoRoot, ref, filePath) {
  return readGitFiles(repoRoot, ref, [filePath]).get(filePath);
}

export function isTestFile(filePath) {
  if (
    !safePath(filePath) ||
    !/^(?:apps|packages)\//u.test(filePath) ||
    filePath.startsWith('apps/app/tests/e2e/') ||
    filePath.startsWith('scripts/')
  ) {
    return false;
  }
  return JS_TEST_RE.test(filePath) || PY_TEST_RE.test(filePath);
}

export function isTestHelperPath(filePath) {
  if (!safePath(filePath)) return false;
  if (GLOBAL_TEST_CONFIGS.includes(filePath)) return false;
  if (isTestFile(filePath) || filePath.endsWith('.snap')) return true;
  return /\/(?:__tests__|__mocks__|tests?|test-utils?|fixtures?|mocks?|snapshots?)\//u.test(
    `/${filePath}`,
  );
}

export function workspaceOf(filePath) {
  return filePath.match(/^((?:apps|packages)\/[^/]+)\//u)?.[1] ?? null;
}

function sourceCandidatePaths(base) {
  const candidates = [base];
  const extension = posix.extname(base);
  if (extension) {
    const without = base.slice(0, -extension.length);
    if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension)) {
      candidates.push(
        `${without}.ts`,
        `${without}.tsx`,
        `${without}.mts`,
        `${without}.cts`,
      );
    }
  } else {
    for (const ext of SOURCE_EXTENSIONS) candidates.push(`${base}${ext}`);
    for (const ext of SOURCE_EXTENSIONS) candidates.push(`${base}/index${ext}`);
  }
  return [...new Set(candidates.map((item) => posix.normalize(item)))];
}

export function extractImports(content) {
  const imports = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gu,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
    /^\s*from\s+(src(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+import\b/gmu,
    /^\s*import\s+(src(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\b/gmu,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) imports.push(match[1]);
    }
  }
  return [...new Set(imports)];
}

function testStem(filePath) {
  const base = posix.basename(filePath);
  return base
    .replace(/\.(?:[cm]?[jt]sx?|py)$/u, '')
    .replace(/\.(?:test|spec)$/u, '')
    .replace(/^test_/u, '')
    .replace(/_test$/u, '');
}

function productionBase(filePath) {
  return posix.basename(filePath, posix.extname(filePath));
}

function readWorkspaceTsconfig(repoRoot, ref, workspace, fileSet) {
  const candidates = [
    `${workspace}/tsconfig.test.json`,
    `${workspace}/tsconfig.json`,
  ];
  for (const filePath of candidates) {
    if (!fileSet.has(filePath)) continue;
    try {
      const parsed = parseJsonc(readGitFile(repoRoot, ref, filePath));
      const compiler = parsed?.compilerOptions ?? {};
      return {
        baseUrl: typeof compiler.baseUrl === 'string' ? compiler.baseUrl : '.',
        paths:
          compiler.paths && typeof compiler.paths === 'object'
            ? compiler.paths
            : {},
      };
    } catch {
      return { baseUrl: '.', paths: {} };
    }
  }
  return { baseUrl: '.', paths: {} };
}

function aliasCandidates(specifier, workspace, config) {
  const candidates = [];
  for (const [pattern, replacements] of Object.entries(config.paths ?? {})) {
    if (!Array.isArray(replacements)) continue;
    const starIndex = pattern.indexOf('*');
    let capture = '';
    if (starIndex === -1) {
      if (specifier !== pattern) continue;
    } else {
      const prefix = pattern.slice(0, starIndex);
      const suffix = pattern.slice(starIndex + 1);
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix))
        continue;
      capture = specifier.slice(
        prefix.length,
        specifier.length - suffix.length,
      );
    }
    for (const replacement of replacements) {
      if (typeof replacement !== 'string') continue;
      const replaced = replacement.replace('*', capture);
      candidates.push(
        posix.normalize(posix.join(workspace, config.baseUrl, replaced)),
      );
    }
  }

  // Common local aliases remain resolvable even when a workspace inherits
  // path settings from a shared tsconfig that this deliberately loose reader
  // does not recursively expand.
  if (specifier.startsWith('@/')) {
    candidates.push(posix.join(workspace, 'src', specifier.slice(2)));
  }
  if (specifier.startsWith('@core/')) {
    candidates.push(
      posix.join(workspace, 'src', specifier.slice('@core/'.length)),
    );
  }
  return [...new Set(candidates)];
}

function resolveOneImport({
  specifier,
  testPath,
  workspace,
  fileSet,
  tsconfig,
}) {
  const roots = [];
  if (specifier.startsWith('.')) {
    roots.push(posix.normalize(posix.join(posix.dirname(testPath), specifier)));
  } else {
    roots.push(...aliasCandidates(specifier, workspace, tsconfig));
  }

  for (const root of roots) {
    for (const candidate of sourceCandidatePaths(root)) {
      if (fileSet.has(candidate)) return candidate;
    }
  }

  if (specifier === 'src' || specifier.startsWith('src.')) {
    const modulePath = specifier.replaceAll('.', '/');
    for (const candidate of [
      `${workspace}/${modulePath}.py`,
      `${workspace}/${modulePath}/__init__.py`,
    ]) {
      if (fileSet.has(candidate)) return candidate;
    }
  }
  return null;
}

export function resolveImports({
  repoRoot,
  ref = 'HEAD',
  testPath,
  content,
  fileSet,
  tsconfig,
}) {
  const workspace = workspaceOf(testPath);
  if (!workspace) return [];
  const config =
    tsconfig ?? readWorkspaceTsconfig(repoRoot, ref, workspace, fileSet);
  return extractImports(content)
    .map((specifier) =>
      resolveOneImport({
        specifier,
        testPath,
        workspace,
        fileSet,
        tsconfig: config,
      }),
    )
    .filter(
      (candidate) =>
        candidate &&
        workspaceOf(candidate) === workspace &&
        !isTestFile(candidate) &&
        SOURCE_EXTENSIONS.includes(posix.extname(candidate)),
    );
}

export function primarySubject(testPath, productionImports) {
  const stem = testStem(testPath);
  const matches = productionImports.filter((filePath) => {
    const base = productionBase(filePath);
    return (
      stem === base ||
      stem.startsWith(`${base}-`) ||
      stem.startsWith(`${base}.`) ||
      stem.startsWith(`${base}_`)
    );
  });
  if (matches.length > 0) {
    return [...matches].sort(
      (a, b) =>
        productionBase(b).length - productionBase(a).length ||
        a.localeCompare(b),
    )[0];
  }
  const unique = [...new Set(productionImports)];
  return unique.length === 1 ? unique[0] : testPath;
}

function countMatches(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

function riskFor(files, contents) {
  const coverageNamed = files.filter((filePath) =>
    COVERAGE_NAME_RE.test(filePath),
  ).length;
  let smells = 0;
  let titleSmells = 0;
  for (const content of contents) {
    smells += countMatches(content, /\bas never\b/gu);
    smells += countMatches(content, /\bas unknown as\b/gu);
    smells += countMatches(content, /\.toBeDefined\s*\(/gu);
    titleSmells += countMatches(
      content,
      /\b(?:it|test|describe)\s*\(\s*['"][^'"]*(?:coverage|gap|100|sweep)[^'"]*['"]/giu,
    );
  }
  return {
    coverageNamed,
    smells,
    titleSmells,
    score: coverageNamed * 10_000 + (smells + titleSmells) * 100 + files.length,
  };
}

export function fingerprintPaths(repoRoot, ref, paths) {
  const hash = createHash('sha256');
  for (const filePath of [...new Set(paths)].sort()) {
    hash.update(filePath);
    hash.update('\0');
    hash.update(readGitFile(repoRoot, ref, filePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function fingerprintScope(repoRoot, ref, scope) {
  return fingerprintPaths(repoRoot, ref, [
    ...(scope.files ?? []),
    ...(scope.relatedPaths ?? []),
  ]);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function packageInfo(repoRoot, ref, workspace, fileSet) {
  const packagePath = `${workspace}/package.json`;
  if (!fileSet.has(packagePath)) return { name: workspace, scripts: {} };
  const parsed = JSON.parse(readGitFile(repoRoot, ref, packagePath));
  return {
    name: typeof parsed.name === 'string' ? parsed.name : workspace,
    scripts:
      parsed.scripts && typeof parsed.scripts === 'object'
        ? parsed.scripts
        : {},
  };
}

function pythonModuleTarget(relativePath) {
  if (!relativePath?.endsWith('.py')) return null;
  const withoutExtension = relativePath.slice(0, -3);
  const modulePath = withoutExtension.endsWith('/__init__')
    ? withoutExtension.slice(0, -'/__init__'.length)
    : withoutExtension;
  return modulePath.replaceAll('/', '.');
}

function commandSet(repoRoot, ref, scope, fileSet) {
  const workspace = workspaceOf(scope.files[0] ?? scope.key);
  if (!workspace) return {};
  const pkg = packageInfo(repoRoot, ref, workspace, fileSet);
  const relTests = scope.files.map((filePath) =>
    posix.relative(workspace, filePath),
  );
  const relSubject =
    scope.key !== scope.files[0] && workspaceOf(scope.key) === workspace
      ? posix.relative(workspace, scope.key)
      : null;

  if (workspace === 'apps/analytics-engine') {
    const tests = relTests.map(shellQuote).join(' ');
    return {
      build: null,
      test: `pnpm --filter ${shellQuote(pkg.name)} exec uv run pytest ${tests} -q -m "not integration"`,
      coverage: relSubject
        ? `pnpm --filter ${shellQuote(pkg.name)} exec uv run pytest ${tests} -q -m "not integration" --cov=${shellQuote(pythonModuleTarget(relSubject))} --cov-report=term-missing --cov-fail-under=0`
        : null,
      typeCheck: pkg.scripts['type-check']
        ? `pnpm --filter ${shellQuote(pkg.name)} type-check`
        : null,
      eslint: `pnpm --filter ${shellQuote(pkg.name)} exec uv run ruff check ${tests}`,
      prettier: null,
      dupCheck: pkg.scripts['dup:check']
        ? `pnpm --filter ${shellQuote(pkg.name)} dup:check`
        : null,
    };
  }

  const tests = relTests.map(shellQuote).join(' ');
  const includes = relSubject
    ? ` --coverage.include=${shellQuote(relSubject)}`
    : '';
  return {
    build: `pnpm --filter ${shellQuote(`${pkg.name}^...`)} build`,
    test: `pnpm --filter ${shellQuote(pkg.name)} exec vitest run ${tests}`,
    coverage: relSubject
      ? `pnpm --filter ${shellQuote(pkg.name)} exec vitest run ${tests} --coverage.enabled${includes} --coverage.reportsDirectory="\${TMPDIR:-/tmp}/test-qa-coverage" --coverage.thresholds.100=false --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 --coverage.thresholds.branches=0 --coverage.thresholds.statements=0`
      : null,
    typeCheck: pkg.scripts['type-check']
      ? `pnpm --filter ${shellQuote(pkg.name)} type-check`
      : null,
    eslint: `pnpm --filter ${shellQuote(pkg.name)} exec eslint ${tests}`,
    prettier: `pnpm exec prettier --check ${scope.files.map(shellQuote).join(' ')}`,
    dupCheck: pkg.scripts['dup:check']
      ? `pnpm --filter ${shellQuote(pkg.name)} dup:check`
      : null,
  };
}

export function collectScopes(repoRoot, { ref = 'HEAD' } = {}) {
  const resolvedRef = resolveGitRef(repoRoot, ref);
  const files = listFilesAtRef(repoRoot, resolvedRef);
  const fileSet = new Set(files);
  const tests = files.filter(isTestFile);
  const workspaces = [...new Set(tests.map(workspaceOf).filter(Boolean))];
  const metadata = workspaces.flatMap((workspace) =>
    [
      `${workspace}/tsconfig.test.json`,
      `${workspace}/tsconfig.json`,
      `${workspace}/package.json`,
    ].filter((filePath) => fileSet.has(filePath)),
  );

  // Test discovery is intentionally O(1) git processes, not one `git show`
  // per file. This is the hot path for the hourly worker on a four-digit test
  // corpus.
  readGitFiles(repoRoot, resolvedRef, [...tests, ...metadata]);

  const configCache = new Map();
  const groups = new Map();

  for (const testPath of tests) {
    const workspace = workspaceOf(testPath);
    if (!workspace) continue;
    if (!configCache.has(workspace)) {
      configCache.set(
        workspace,
        readWorkspaceTsconfig(repoRoot, resolvedRef, workspace, fileSet),
      );
    }
    const content = readGitFile(repoRoot, resolvedRef, testPath);
    const imports = [
      ...new Set(
        resolveImports({
          repoRoot,
          ref: resolvedRef,
          testPath,
          content,
          fileSet,
          tsconfig: configCache.get(workspace),
        }),
      ),
    ].sort();
    const productionImports = imports.filter(
      (filePath) => !isTestHelperPath(filePath),
    );
    const subject = primarySubject(testPath, productionImports);
    const key = subject;
    const group = groups.get(key) ?? {
      key,
      files: [],
      relatedPaths: new Set(),
      contents: [],
    };
    group.files.push(testPath);
    group.contents.push(content);
    for (const imported of imports) group.relatedPaths.add(imported);
    if (!isTestFile(subject)) group.relatedPaths.add(subject);
    groups.set(key, group);
  }

  const related = [
    ...new Set(
      [...groups.values()].flatMap((group) => [...group.relatedPaths]),
    ),
  ];
  readGitFiles(repoRoot, resolvedRef, related);

  return [...groups.values()]
    .map((group) => {
      const filesInScope = [...group.files].sort();
      const relatedPaths = [...group.relatedPaths].sort();
      const base = {
        key: group.key,
        files: filesInScope,
        relatedPaths,
        workspace: workspaceOf(filesInScope[0] ?? group.key),
        risk: riskFor(filesInScope, group.contents),
      };
      return {
        ...base,
        fingerprint: fingerprintScope(repoRoot, resolvedRef, base),
        commands: commandSet(repoRoot, resolvedRef, base, fileSet),
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

function assertKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unknown fields: ${unknown.join(', ')}`);
  }
}

function assertIso(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO date string`);
  }
}

function validateFinding(finding, label) {
  assertKeys(finding, ['id', 'kind', 'summary', 'issue'], label);
  if (typeof finding.id !== 'string' || finding.id.length > 128) {
    throw new Error(`${label}.id is invalid`);
  }
  if (!['test', 'production', 'bug'].includes(finding.kind)) {
    throw new Error(`${label}.kind is invalid`);
  }
  if (
    typeof finding.summary !== 'string' ||
    finding.summary.length === 0 ||
    finding.summary.length > MAX_TEXT_LENGTH
  ) {
    throw new Error(`${label}.summary is invalid`);
  }
  if (
    finding.issue !== undefined &&
    finding.issue !== null &&
    (!Number.isInteger(finding.issue) || finding.issue <= 0)
  ) {
    throw new Error(`${label}.issue is invalid`);
  }
}

function validateScopeState(scope, label) {
  assertKeys(
    scope,
    [
      'status',
      'auditedAt',
      'auditedCommit',
      'fingerprint',
      'files',
      'relatedPaths',
      'pr',
      'findings',
    ],
    label,
  );
  if (!['clean', 'pending', 'finding', 'rejected'].includes(scope.status)) {
    throw new Error(`${label}.status is invalid`);
  }
  assertIso(scope.auditedAt, `${label}.auditedAt`);
  if (
    typeof scope.auditedCommit !== 'string' ||
    scope.auditedCommit.length > 128
  ) {
    throw new Error(`${label}.auditedCommit is invalid`);
  }
  if (!/^[a-f0-9]{64}$/u.test(scope.fingerprint ?? '')) {
    throw new Error(`${label}.fingerprint is invalid`);
  }
  for (const field of ['files', 'relatedPaths']) {
    if (!Array.isArray(scope[field]) || !scope[field].every(safePath)) {
      throw new Error(`${label}.${field} is invalid`);
    }
  }
  if (
    scope.pr !== undefined &&
    scope.pr !== null &&
    (!Number.isInteger(scope.pr) || scope.pr <= 0)
  ) {
    throw new Error(`${label}.pr is invalid`);
  }
  if (!Array.isArray(scope.findings)) {
    throw new Error(`${label}.findings must be an array`);
  }
  scope.findings.forEach((finding, index) =>
    validateFinding(finding, `${label}.findings[${index}]`),
  );
}

export function emptyState() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    generatedAt: new Date(0).toISOString(),
    github: { runId: 0, runAttempt: 1, sha: '' },
    scopes: {},
    runs: [],
  };
}

export function validateState(input) {
  assertKeys(
    input,
    ['schemaVersion', 'generatedAt', 'github', 'scopes', 'runs'],
    'state',
  );
  if (input.schemaVersion !== STATE_SCHEMA_VERSION) {
    throw new Error(`unsupported state schemaVersion: ${input.schemaVersion}`);
  }
  assertIso(input.generatedAt, 'state.generatedAt');
  assertKeys(input.github, ['runId', 'runAttempt', 'sha'], 'state.github');
  if (!Number.isInteger(input.github.runId) || input.github.runId < 0) {
    throw new Error('state.github.runId is invalid');
  }
  if (
    !Number.isInteger(input.github.runAttempt) ||
    input.github.runAttempt < 1
  ) {
    throw new Error('state.github.runAttempt is invalid');
  }
  if (typeof input.github.sha !== 'string' || input.github.sha.length > 128) {
    throw new Error('state.github.sha is invalid');
  }
  if (
    !input.scopes ||
    typeof input.scopes !== 'object' ||
    Array.isArray(input.scopes)
  ) {
    throw new Error('state.scopes must be an object');
  }
  for (const [key, scope] of Object.entries(input.scopes)) {
    if (!safePath(key)) throw new Error(`unsafe scope key: ${key}`);
    validateScopeState(scope, `state.scopes[${key}]`);
  }
  if (!Array.isArray(input.runs))
    throw new Error('state.runs must be an array');
  for (const [index, run] of input.runs.entries()) {
    assertKeys(
      run,
      ['workerRunId', 'at', 'outcome', 'scopes'],
      `state.runs[${index}]`,
    );
    if (
      typeof run.workerRunId !== 'string' ||
      run.workerRunId.length === 0 ||
      run.workerRunId.length > 128
    ) {
      throw new Error(`state.runs[${index}].workerRunId is invalid`);
    }
    assertIso(run.at, `state.runs[${index}].at`);
    if (typeof run.outcome !== 'string' || run.outcome.length > 128) {
      throw new Error(`state.runs[${index}].outcome is invalid`);
    }
    if (!Array.isArray(run.scopes) || !run.scopes.every(safePath)) {
      throw new Error(`state.runs[${index}].scopes is invalid`);
    }
  }
  return input;
}

export function findingId(kind, summary) {
  return createHash('sha256')
    .update(kind)
    .update('\0')
    .update(summary)
    .digest('hex')
    .slice(0, 16);
}

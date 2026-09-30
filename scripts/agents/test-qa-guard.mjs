#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  GLOBAL_TEST_CONFIGS,
  isTestHelperPath,
  listFilesAtRef,
  readGitFile,
  safePath,
} from './test-qa-lib.mjs';

const ADDED_FORBIDDEN = [
  { label: 'focused test', pattern: /\.only\s*\(/u },
  { label: 'skipped test', pattern: /\.skip\s*\(/u },
  { label: 'xit', pattern: /\bxit\s*\(/u },
  { label: 'describe.skip', pattern: /\bdescribe\.skip\s*\(/u },
  {
    label: 'coverage ignore',
    pattern:
      /(?:c8|istanbul|v8)\s+ignore|pragma:\s*no\s+cover|coverage:\s*ignore/iu,
  },
  { label: '@ts-ignore', pattern: /@ts-ignore\b/u },
  { label: '@ts-nocheck', pattern: /@ts-nocheck\b/u },
];

function git(repoRoot, args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function changedPaths(repoRoot, base, head = null) {
  let raw = git(repoRoot, [
    'diff',
    '--name-status',
    '-z',
    '--find-renames',
    base,
    ...(head ? [head] : []),
    '--',
  ]);
  if (!head)
    raw += git(repoRoot, [
      'diff',
      '--cached',
      '--name-status',
      '-z',
      '--find-renames',
      base,
      '--',
    ]);
  const tokens = raw.split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < tokens.length; ) {
    const status = tokens[index++];
    if (!status) break;
    if (status.startsWith('R') || status.startsWith('C')) {
      paths.push(tokens[index++] ?? '', tokens[index++] ?? '');
    } else {
      paths.push(tokens[index++] ?? '');
    }
  }
  if (!head) {
    paths.push(
      ...git(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z'])
        .split('\0')
        .filter(Boolean),
    );
  }
  return [...new Set(paths.filter(Boolean))];
}

export function diffText(repoRoot, base, head = null) {
  const diff = git(repoRoot, [
    'diff',
    '--find-renames',
    '--unified=0',
    '--no-ext-diff',
    '--no-color',
    base,
    ...(head ? [head] : []),
    '--',
  ]);
  return head
    ? diff
    : diff +
        git(repoRoot, [
          'diff',
          '--cached',
          '--find-renames',
          '--unified=0',
          '--no-ext-diff',
          '--no-color',
          base,
          '--',
        ]);
}

export function discoverConfiguredGlobalTestFiles(repoRoot, ref = 'HEAD') {
  const files = listFilesAtRef(repoRoot, ref);
  const discovered = new Set(
    files.filter(
      (filePath) =>
        filePath.startsWith('apps/analytics-engine/') &&
        posix.basename(filePath) === 'conftest.py',
    ),
  );

  for (const configPath of files.filter((filePath) =>
    /(?:^|\/)vitest\.config\.[^/]+$/u.test(filePath),
  )) {
    const content = readGitFile(repoRoot, ref, configPath);
    for (const property of content.matchAll(
      /\b(?:setupFiles|globalSetup)\s*:\s*(\[[\s\S]*?\]|['"][^'"]+['"])/gu,
    )) {
      for (const match of property[1].matchAll(/['"]([^'"]+)['"]/gu)) {
        const raw = match[1];
        if (!raw || raw.startsWith('/') || raw.startsWith('@')) continue;
        const resolved = posix.normalize(
          posix.join(posix.dirname(configPath), raw),
        );
        if (safePath(resolved)) discovered.add(resolved);
      }
    }
  }

  return [...discovered].sort();
}

export function evaluateGuard({
  paths,
  diff,
  globalConfigs = GLOBAL_TEST_CONFIGS,
}) {
  const reasons = [];
  for (const filePath of paths) {
    if (!safePath(filePath)) {
      reasons.push(`unsafe changed path: ${filePath}`);
      continue;
    }
    if (globalConfigs.includes(filePath)) {
      reasons.push(`global test setup is protected: ${filePath}`);
      continue;
    }
    if (!isTestHelperPath(filePath)) {
      reasons.push(`Phase 1 allows test/test-helper paths only: ${filePath}`);
    }
  }

  for (const line of diff.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const added = line.slice(1);
    for (const rule of ADDED_FORBIDDEN) {
      if (rule.pattern.test(added)) {
        reasons.push(
          `new ${rule.label} is forbidden: ${added.trim().slice(0, 180)}`,
        );
      }
    }
  }

  return {
    decision: reasons.length === 0 ? 'allow' : 'deny',
    reasons: [...new Set(reasons)],
  };
}

function parseArgs(argv) {
  const options = {
    base: null,
    head: null,
    repoRoot: process.cwd(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[++index];
    if (value === undefined) throw new Error(`missing value for ${arg}`);
    if (arg === '--base') options.base = value;
    else if (arg === '--head') options.head = value;
    else if (arg === '--repo') options.repoRoot = value;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.base) throw new Error('--base is required');
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = evaluateGuard({
    paths: changedPaths(options.repoRoot, options.base, options.head),
    diff: diffText(options.repoRoot, options.base, options.head),
  });
  if (!options.head) {
    const untracked = git(options.repoRoot, [
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
    ])
      .split('\0')
      .filter(Boolean);
    if (untracked.length) {
      result.decision = 'deny';
      result.reasons.push(
        'Stage new files before running the guard: ' + untracked.join(', '),
      );
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.decision !== 'allow') process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

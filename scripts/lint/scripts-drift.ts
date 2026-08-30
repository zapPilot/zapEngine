#!/usr/bin/env pnpm tsx

import { join, relative } from 'path';

import {
  DriftIssue,
  findWorkspaceFiles,
  readJson,
  reportAndExit,
} from './drift-lib';

const ROOT = process.cwd();

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
}

const REQUIRED_SCRIPTS = new Set<string>(['build', 'type-check']);
const TEST_SCRIPTS = [
  'test',
  'test:ci',
  'test:coverage',
  'test:watch',
  'test:unit',
  'test:e2e',
];
const EXPECTED_DUP_CHECK = 'node ../../scripts/lint/run-jscpd.mjs src';
const ALLOWED_DUP_CHECKS = new Set([
  EXPECTED_DUP_CHECK,
  'node ../../scripts/lint/run-jscpd.mjs lib',
  'node ../../scripts/lint/run-jscpd.mjs tests',
]);
const ALLOWED_REAL_TEST_PACKAGES = new Set(['@zapengine/types']);

function hasScripts(content: string): boolean {
  try {
    return Boolean((JSON.parse(content) as PackageJson).scripts);
  } catch {
    return false;
  }
}

function main() {
  const issues: DriftIssue[] = [];

  const allPkgs = [
    ...findWorkspaceFiles(join(ROOT, 'apps'), 'package.json', hasScripts),
    ...findWorkspaceFiles(join(ROOT, 'packages'), 'package.json', hasScripts),
  ];

  const scriptMatrix: Record<string, Record<string, boolean>> = {};

  for (const pkgPath of allPkgs) {
    const dir = join(pkgPath, '..');
    const rel = relative(ROOT, dir);
    const pkg = readJson<PackageJson>(pkgPath);
    const name = pkg.name || rel;
    const scripts = pkg.scripts || {};

    scriptMatrix[name] = {};

    for (const script of [...REQUIRED_SCRIPTS, ...TEST_SCRIPTS]) {
      scriptMatrix[name][script] = script in scripts;
    }

    const missingRequired = [...REQUIRED_SCRIPTS].filter(
      (s) => !(s in scripts),
    );
    if (missingRequired.length > 0) {
      issues.push({
        type: 'missing_required_scripts',
        file: rel,
        issue: `Missing required scripts: ${missingRequired.join(', ')}`,
        severity: 'HIGH',
      });
    }

    const testScripts = Object.keys(scripts).filter(
      (s) => s.startsWith('test:') || s === 'test',
    );

    if (
      name.includes('types') &&
      !ALLOWED_REAL_TEST_PACKAGES.has(name) &&
      testScripts.length > 0
    ) {
      const isPlaceholder = testScripts.every((s) =>
        scripts[s]?.includes('echo'),
      );
      if (!isPlaceholder) {
        issues.push({
          type: 'unexpected_tests',
          file: rel,
          issue:
            'Types package should not have real tests (only echo placeholders)',
          severity: 'LOW',
        });
      }
    }

    if (
      'dup:check' in scripts &&
      !ALLOWED_DUP_CHECKS.has(scripts['dup:check'] ?? '')
    ) {
      issues.push({
        type: 'jscpd_script_drift',
        file: rel,
        issue: `dup:check is "${scripts['dup:check']}" (expected one of ${[
          ...ALLOWED_DUP_CHECKS,
        ].join(', ')})`,
        severity: 'HIGH',
      });
    }
  }

  // Detect script drift: if >50% have a script, warn on missing
  const allScripts = [...REQUIRED_SCRIPTS, ...TEST_SCRIPTS];
  for (const script of allScripts) {
    const hasCount = Object.values(scriptMatrix).filter(
      (m) => m[script],
    ).length;
    const totalCount = Object.keys(scriptMatrix).length;
    const hasMajority = hasCount > totalCount / 2;

    if (hasMajority) {
      for (const [name, matrix] of Object.entries(scriptMatrix)) {
        if (!matrix[script]) {
          const isRequired = REQUIRED_SCRIPTS.has(script);
          issues.push({
            type: 'script_drift',
            file: name,
            issue: `Missing "${script}" (${hasCount}/${totalCount} packages have it)`,
            severity: isRequired ? 'HIGH' : 'MEDIUM',
          });
        }
      }
    }
  }

  console.log('📋 Script matrix:\n');
  console.table(scriptMatrix);

  reportAndExit(issues, {
    header: '\n⚠️  Script drift issues:\n',
    ok: '\n✅ No script drift detected',
  });
}

main();

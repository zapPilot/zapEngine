#!/usr/bin/env pnpm tsx

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
}

const REQUIRED_SCRIPTS = ['build', 'type-check'];
const TEST_SCRIPTS = [
  'test',
  'test:ci',
  'test:coverage',
  'test:watch',
  'test:unit',
  'test:e2e',
  'test:e2e:safe',
];

function findPackageJson(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        const pkgPath = join(fullPath, 'package.json');
        try {
          const content = readFileSync(pkgPath, 'utf-8');
          const pkg: PackageJson = JSON.parse(content);
          if (pkg.scripts) {
            results.push(pkgPath);
          }
        } catch {
          // not a package
        }
      }
    }
  } catch {
    // dir doesn't exist
  }
  return results;
}

function loadPackageJson(path: string): PackageJson {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

function main() {
  const issues: Array<{ type: string; file: string; issue: string; severity: string }> = [];

  const appsDir = join(ROOT, 'apps');
  const packagesDir = join(ROOT, 'packages');

  const appPkgs = findPackageJson(appsDir);
  const packagePkgs = findPackageJson(packagesDir);
  const allPkgs = [...appPkgs, ...packagePkgs];

  const scriptMatrix: Record<string, Record<string, boolean>> = {};

  for (const pkgPath of allPkgs) {
    const dir = join(pkgPath, '..');
    const rel = relative(ROOT, dir);
    const pkg = loadPackageJson(pkgPath);
    const name = pkg.name || rel;
    const scripts = pkg.scripts || {};

    scriptMatrix[name] = {};

    for (const script of [...REQUIRED_SCRIPTS, ...TEST_SCRIPTS]) {
      scriptMatrix[name][script] = script in scripts;
    }

    const missingRequired = REQUIRED_SCRIPTS.filter((s) => !(s in scripts));
    if (missingRequired.length > 0) {
      issues.push({
        type: 'missing_required_scripts',
        file: rel,
        issue: `Missing required scripts: ${missingRequired.join(', ')}`,
        severity: 'HIGH',
      });
    }

    const testScripts = Object.keys(scripts).filter(
      (s) => s.startsWith('test:') || s === 'test'
    );

    if (name.includes('types') && testScripts.length > 0) {
      const isPlaceholder = testScripts.every(
        (s) => scripts[s]?.includes('echo')
      );
      if (!isPlaceholder) {
        issues.push({
          type: 'unexpected_tests',
          file: rel,
          issue: 'Types package should not have real tests (only echo placeholders)',
          severity: 'LOW',
        });
      }
    }
  }

  // Detect script drift: if >50% have a script, warn on missing
  const allScripts = [...REQUIRED_SCRIPTS, ...TEST_SCRIPTS];
  for (const script of allScripts) {
    const hasCount = Object.values(scriptMatrix).filter((m) => m[script]).length;
    const totalCount = Object.keys(scriptMatrix).length;
    const hasMajority = hasCount > totalCount / 2;

    if (hasMajority) {
      for (const [name, matrix] of Object.entries(scriptMatrix)) {
        if (!matrix[script]) {
          const isRequired = REQUIRED_SCRIPTS.includes(script as any);
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

  if (issues.length > 0) {
    console.log('\n⚠️  Script drift issues:\n');
    for (const issue of issues) {
      console.log(`[${issue.severity}] ${issue.type}: ${issue.file}`);
      console.log(`        ${issue.issue}`);
    }
    process.exit(1);
  } else {
    console.log('\n✅ No script drift detected');
    process.exit(0);
  }
}

main();
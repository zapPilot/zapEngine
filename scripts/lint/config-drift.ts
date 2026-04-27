#!/usr/bin/env pnpm tsx

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

interface TsConfig {
  compilerOptions?: {
    rootDir?: string;
    types?: string[];
    noEmit?: boolean;
    outDir?: string;
  };
  include?: string[];
  exclude?: string[];
}


const ROOT = process.cwd();
const APPS_DIR = join(ROOT, 'apps');
const PACKAGES_DIR = join(ROOT, 'packages');

function findTsConfigs(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        const tsconfigPath = join(fullPath, 'tsconfig.json');
        try {
          readFileSync(tsconfigPath);
          results.push(tsconfigPath);
        } catch {
          // no tsconfig.json in this subdir
        }
      }
    }
  } catch {
    // dir doesn't exist
  }
  return results;
}

function loadTsConfig(path: string): TsConfig {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

function getPackageName(dir: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
    return pkg.name || dir;
  } catch {
    return dir;
  }
}

function main() {
  const issues: Array<{ type: string; file: string; issue: string; severity: string }> = [];

  const appDirs = findTsConfigs(APPS_DIR);
  const packageDirs = findTsConfigs(PACKAGES_DIR);
  const allConfigs = [...appDirs, ...packageDirs];

  const rootDirs: string[] = [];

  for (const configPath of allConfigs) {
    const dir = join(configPath, '..');
    const name = getPackageName(dir);
    const rel = relative(ROOT, dir);
    const cfg = loadTsConfig(configPath);

    if (cfg.compilerOptions?.rootDir !== undefined) {
      rootDirs.push(cfg.compilerOptions.rootDir);
      if (cfg.compilerOptions.rootDir !== './src' && cfg.compilerOptions.rootDir !== '.') {
        issues.push({
          type: 'tsconfig_rootDir',
          file: rel,
          issue: `rootDir is "${cfg.compilerOptions.rootDir}" (expected "./src" or ".")`,
          severity: 'HIGH',
        });
      }
    }

    if (cfg.compilerOptions?.types !== undefined) {
      const types = cfg.compilerOptions.types;
      const typeStr = JSON.stringify(types);
      if (!['["node","vitest/globals"]', '["vitest/globals"]', '[]'].includes(typeStr)) {
        issues.push({
          type: 'tsconfig_types',
          file: rel,
          issue: `types is ${typeStr}`,
          severity: 'MEDIUM',
        });
      }
    }

    if (cfg.include?.includes('test/**/*') && !cfg.include?.includes('tsconfig.test.json')) {
      issues.push({
        type: 'tsconfig_inline_tests',
        file: rel,
        issue: 'includes test/**/* inline (consider tsconfig.test.json like frontend)',
        severity: 'LOW',
      });
    }
  }

  const uniqueRootDirs = [...new Set(rootDirs)];
  if (uniqueRootDirs.length > 1) {
    console.log('⚠️  tsconfig rootDir drift detected:');
    for (const rd of uniqueRootDirs) {
      console.log(`  - rootDir: "${rd}"`);
    }
    console.log('');
  }

  if (issues.length > 0) {
    console.log('📋 Config drift issues:\n');
    for (const issue of issues) {
      console.log(`[${issue.severity}] ${issue.type}: ${issue.file}`);
      console.log(`        ${issue.issue}`);
    }
    console.log('');
    process.exit(1);
  } else {
    console.log('✅ No config drift detected');
    process.exit(0);
  }
}

main();

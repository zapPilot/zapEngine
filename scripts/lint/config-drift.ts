#!/usr/bin/env pnpm tsx

import { join, relative } from 'path';

import {
  DriftIssue,
  findWorkspaceFiles,
  readJson,
  reportAndExit,
} from './drift-lib';

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
const LOCAL_JSCPD_KEYS = new Set([
  '$schema',
  'format',
  'ignore',
  'ignorePattern',
]);

function main() {
  const issues: DriftIssue[] = [];

  const allConfigs = [
    ...findWorkspaceFiles(APPS_DIR, 'tsconfig.json'),
    ...findWorkspaceFiles(PACKAGES_DIR, 'tsconfig.json'),
  ];

  for (const configPath of allConfigs) {
    const dir = join(configPath, '..');
    const rel = relative(ROOT, dir);
    const cfg = readJson<TsConfig>(configPath);

    if (cfg.compilerOptions?.rootDir !== undefined) {
      if (
        cfg.compilerOptions.rootDir !== './src' &&
        cfg.compilerOptions.rootDir !== '.'
      ) {
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
      if (
        !['["node","vitest/globals"]', '["vitest/globals"]', '[]'].includes(
          typeStr,
        )
      ) {
        issues.push({
          type: 'tsconfig_types',
          file: rel,
          issue: `types is ${typeStr}`,
          severity: 'MEDIUM',
        });
      }
    }

    if (
      cfg.include?.includes('test/**/*') &&
      !cfg.include?.includes('tsconfig.test.json')
    ) {
      issues.push({
        type: 'tsconfig_inline_tests',
        file: rel,
        issue:
          'includes test/**/* inline (consider a dedicated tsconfig.test.json)',
        severity: 'LOW',
      });
    }
  }

  const jscpdConfigs = [
    ...findWorkspaceFiles(APPS_DIR, '.jscpd.json'),
    ...findWorkspaceFiles(PACKAGES_DIR, '.jscpd.json'),
  ];

  for (const jscpdPath of jscpdConfigs) {
    const rel = relative(ROOT, join(jscpdPath, '..'));
    const cfg = readJson<Record<string, unknown>>(jscpdPath);
    const rootOwnedKeys = Object.keys(cfg).filter(
      (key) => !LOCAL_JSCPD_KEYS.has(key),
    );

    if (rootOwnedKeys.length > 0) {
      issues.push({
        type: 'jscpd_local_root_owned_keys',
        file: rel,
        issue: `Local .jscpd.json owns root config keys: ${rootOwnedKeys.join(', ')}`,
        severity: 'HIGH',
      });
    }
  }

  reportAndExit(issues, {
    header: '📋 Config drift issues:\n',
    ok: '✅ No config drift detected',
    footer: '',
  });
}

main();

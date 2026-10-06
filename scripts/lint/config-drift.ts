#!/usr/bin/env pnpm tsx

import { execFileSync } from 'child_process';
import { basename, join, relative } from 'path';

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

/**
 * A git index entry. For a symlink git stores the link target as the blob, so
 * `content` is that target.
 */
export interface IndexEntry {
  path: string;
  mode: string;
  content?: string;
}

const SYMLINK_MODE = '120000';
const SKILLS_LINK = '.claude/skills';
const SKILLS_TARGET = '../.agents/skills';

function agentFileIssue(type: string, file: string, issue: string): DriftIssue {
  return { type, file, issue, severity: 'HIGH' };
}

/**
 * Skills live only in .agents/skills; .claude/skills must stay a symlink to it
 * so Claude, Codex and opencode read one copy. A real directory there would
 * pass every other check while silently diverging.
 */
export function checkSkillsLink(entries: readonly IndexEntry[]): DriftIssue[] {
  const link = entries.find((entry) => entry.path === SKILLS_LINK);
  const copied = entries.some((entry) =>
    entry.path.startsWith(`${SKILLS_LINK}/`),
  );
  const fix = `replace it with \`ln -s ${SKILLS_TARGET} ${SKILLS_LINK}\``;

  if (copied || (link !== undefined && link.mode !== SYMLINK_MODE)) {
    return [
      agentFileIssue(
        'skills_link_not_symlink',
        SKILLS_LINK,
        `is not a symlink; skills belong in ${SKILLS_TARGET.slice(3)} only — ${fix}`,
      ),
    ];
  }
  if (link === undefined) {
    return [
      agentFileIssue('skills_link_missing', SKILLS_LINK, `not tracked; ${fix}`),
    ];
  }
  if (link.content !== SKILLS_TARGET) {
    return [
      agentFileIssue(
        'skills_link_target',
        SKILLS_LINK,
        `points to "${link.content ?? ''}"; it must point to "${SKILLS_TARGET}"`,
      ),
    ];
  }
  return [];
}

/** Lists the tracked skills link from the git index. */
export function readIndexEntries(root: string): IndexEntry[] {
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf-8' });

  return git(['ls-files', '--stage', '-z', '--', SKILLS_LINK])
    .split('\0')
    .filter((record) => record !== '')
    .map((record) => {
      const tab = record.indexOf('\t');
      const [mode, oid] = record.slice(0, tab).split(' ');
      const path = record.slice(tab + 1);
      const content = git(['cat-file', 'blob', oid]);
      return { path, mode, content };
    });
}

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

  const indexEntries = readIndexEntries(ROOT);
  issues.push(...checkSkillsLink(indexEntries));

  reportAndExit(issues, {
    header: '📋 Config drift issues:\n',
    ok: '✅ No config drift detected',
    footer: '',
  });
}

const isMainModule =
  !!process.argv[1] && basename(process.argv[1]) === 'config-drift.ts';
if (isMainModule) main();

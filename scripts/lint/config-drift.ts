#!/usr/bin/env pnpm tsx

import { execFileSync } from 'child_process';
import { basename, join, posix, relative } from 'path';

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
 * A git index entry. `content` is the blob of an entry point; for a symlink
 * git stores the link target as that blob.
 */
export interface IndexEntry {
  path: string;
  mode: string;
  content?: string;
}

const AGENT_INSTRUCTIONS = 'AGENTS.md';
const ENTRY_POINTS = ['CLAUDE.md', 'GEMINI.md'];
const NESTED_ENTRY_POINT = 'CLAUDE.md';
const NESTED_POINTER =
  'See @AGENTS.md for the canonical instructions for this scope.';
const FILE_MODE = '100644';
const SYMLINK_MODE = '120000';
const WORKSPACE_ROOT = /^(?:\.|(?:apps|packages)\/[^/]+)$/;

function agentFileIssue(type: string, file: string, issue: string): DriftIssue {
  return { type, file, issue, severity: 'HIGH' };
}

function workspaceEntryPointIssue(
  path: string,
  entry: IndexEntry | undefined,
): DriftIssue | undefined {
  if (entry === undefined) {
    return agentFileIssue(
      'agent_entry_point_missing',
      path,
      `not tracked; add \`ln -s ${AGENT_INSTRUCTIONS} ${posix.basename(path)}\` beside ${AGENT_INSTRUCTIONS}`,
    );
  }
  if (entry.mode !== SYMLINK_MODE) {
    return agentFileIssue(
      'agent_entry_point_not_symlink',
      path,
      `tracked with mode ${entry.mode}; workspace-root entry points must be symlinks (mode ${SYMLINK_MODE}) to ${AGENT_INSTRUCTIONS}`,
    );
  }
  if (entry.content !== AGENT_INSTRUCTIONS) {
    return agentFileIssue(
      'agent_entry_point_target',
      path,
      `points to "${entry.content ?? ''}"; it must point to "${AGENT_INSTRUCTIONS}"`,
    );
  }
  return undefined;
}

function nestedEntryPointIssue(
  path: string,
  entry: IndexEntry | undefined,
): DriftIssue | undefined {
  if (entry === undefined) {
    return agentFileIssue(
      'agent_entry_point_missing',
      path,
      `not tracked; add the one-line pointer "${NESTED_POINTER}"`,
    );
  }
  if (entry.mode !== FILE_MODE || entry.content !== `${NESTED_POINTER}\n`) {
    return agentFileIssue(
      'agent_entry_point_not_pointer',
      path,
      `must be a regular file holding only "${NESTED_POINTER}"; instructions belong in ${AGENT_INSTRUCTIONS}`,
    );
  }
  return undefined;
}

/**
 * Agent CLIs auto-load only their own file name, so every AGENTS.md scope needs
 * a CLAUDE.md beside it. The repo root and each workspace root also carry
 * GEMINI.md, and there both must be symlinks so they cannot diverge from
 * AGENTS.md. A nested scope carries only a CLAUDE.md holding the pointer line,
 * so instructions cannot drift into it. Takes git index entries rather than the
 * working tree so an untracked file cannot make the check pass.
 */
export function checkAgentEntryPoints(
  entries: readonly IndexEntry[],
): DriftIssue[] {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const instructions = entries.filter(
    (entry) => posix.basename(entry.path) === AGENT_INSTRUCTIONS,
  );
  const scopes = new Set(
    instructions.map((entry) => posix.dirname(entry.path)),
  );
  const issues: DriftIssue[] = [];

  for (const entry of instructions) {
    if (entry.mode === SYMLINK_MODE) {
      issues.push(
        agentFileIssue(
          'agent_instructions_symlink',
          entry.path,
          `is a symlink; ${AGENT_INSTRUCTIONS} must hold the instructions and its entry points link to it`,
        ),
      );
    }
  }

  for (const scope of [...scopes].sort()) {
    if (WORKSPACE_ROOT.test(scope)) {
      for (const name of ENTRY_POINTS) {
        const path = posix.join(scope, name);
        const issue = workspaceEntryPointIssue(path, byPath.get(path));
        if (issue !== undefined) issues.push(issue);
      }
      continue;
    }

    const path = posix.join(scope, NESTED_ENTRY_POINT);
    const issue = nestedEntryPointIssue(path, byPath.get(path));
    if (issue !== undefined) issues.push(issue);
  }

  for (const entry of entries) {
    const name = posix.basename(entry.path);
    if (!ENTRY_POINTS.includes(name)) continue;
    const scope = posix.dirname(entry.path);
    if (!scopes.has(scope)) {
      issues.push(
        agentFileIssue(
          'agent_entry_point_orphan',
          entry.path,
          `has no tracked ${AGENT_INSTRUCTIONS} beside it to point at`,
        ),
      );
    } else if (name !== NESTED_ENTRY_POINT && !WORKSPACE_ROOT.test(scope)) {
      issues.push(
        agentFileIssue(
          'agent_entry_point_unexpected',
          entry.path,
          `nested scopes carry only ${NESTED_ENTRY_POINT}; remove it`,
        ),
      );
    }
  }

  return issues;
}

/** Lists the tracked instruction files and entry points from the git index. */
export function readIndexEntries(root: string): IndexEntry[] {
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf-8' });
  const blobs = new Map<string, string>();
  const pathspecs = [AGENT_INSTRUCTIONS, ...ENTRY_POINTS].map(
    (name) => `*${name}`,
  );

  return git(['ls-files', '--stage', '-z', '--', ...pathspecs])
    .split('\0')
    .filter((record) => record !== '')
    .map((record) => {
      const tab = record.indexOf('\t');
      const [mode, oid] = record.slice(0, tab).split(' ');
      const path = record.slice(tab + 1);
      if (!ENTRY_POINTS.includes(posix.basename(path))) return { path, mode };

      let content = blobs.get(oid);
      if (content === undefined) {
        content = git(['cat-file', 'blob', oid]);
        blobs.set(oid, content);
      }
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

  issues.push(...checkAgentEntryPoints(readIndexEntries(ROOT)));

  reportAndExit(issues, {
    header: '📋 Config drift issues:\n',
    ok: '✅ No config drift detected',
    footer: '',
  });
}

const isMainModule =
  !!process.argv[1] && basename(process.argv[1]) === 'config-drift.ts';
if (isMainModule) main();

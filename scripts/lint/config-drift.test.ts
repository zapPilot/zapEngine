import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  checkAgentEntryPoints,
  readIndexEntries,
  type IndexEntry,
} from './config-drift.ts';

// Git hooks export GIT_INDEX_FILE / GIT_DIR; left in place, the temp-repo git
// calls below would read and write the caller's index instead of their own.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('GIT_')) delete process.env[key];
}

const POINTER =
  'See @AGENTS.md for the canonical instructions for this scope.\n';

const file = (path: string): IndexEntry => ({ path, mode: '100644' });
const link = (path: string, content = 'AGENTS.md'): IndexEntry => ({
  path,
  mode: '120000',
  content,
});
const pointer = (path: string, content = POINTER): IndexEntry => ({
  path,
  mode: '100644',
  content,
});

function workspaceRoot(dir: string): IndexEntry[] {
  const prefix = dir === '.' ? '' : `${dir}/`;
  return [
    file(`${prefix}AGENTS.md`),
    link(`${prefix}CLAUDE.md`),
    link(`${prefix}GEMINI.md`),
  ];
}

function nestedScope(dir: string): IndexEntry[] {
  return [file(`${dir}/AGENTS.md`), pointer(`${dir}/CLAUDE.md`)];
}

const conforming: IndexEntry[] = [
  ...workspaceRoot('.'),
  ...workspaceRoot('apps/app'),
  ...workspaceRoot('packages/types'),
  ...nestedScope('apps'),
  ...nestedScope('packages'),
  ...nestedScope('.agents'),
  ...nestedScope('apps/podcast-pipeline/src/social'),
];

const without = (entries: IndexEntry[], path: string) =>
  entries.filter((entry) => entry.path !== path);
const replacing = (entries: IndexEntry[], replacement: IndexEntry) => [
  ...without(entries, replacement.path),
  replacement,
];
const summarize = (entries: IndexEntry[]) =>
  checkAgentEntryPoints(entries).map(({ type, file }) => ({ type, file }));

describe('checkAgentEntryPoints', () => {
  it('accepts workspace-root symlinks and CLAUDE.md-only nested pointers', () => {
    assert.deepEqual(checkAgentEntryPoints(conforming), []);
  });

  it('requires a CLAUDE.md pointer in a nested scope', () => {
    assert.deepEqual(
      summarize(
        without(conforming, 'apps/podcast-pipeline/src/social/CLAUDE.md'),
      ),
      [
        {
          type: 'agent_entry_point_missing',
          file: 'apps/podcast-pipeline/src/social/CLAUDE.md',
        },
      ],
    );
  });

  it('rejects a nested CLAUDE.md that is anything but the pointer line', () => {
    assert.deepEqual(
      summarize(
        replacing(
          replacing(
            conforming,
            pointer('.agents/CLAUDE.md', `${POINTER}\nAlways run the tests.\n`),
          ),
          link('apps/podcast-pipeline/src/social/CLAUDE.md'),
        ),
      ),
      [
        { type: 'agent_entry_point_not_pointer', file: '.agents/CLAUDE.md' },
        {
          type: 'agent_entry_point_not_pointer',
          file: 'apps/podcast-pipeline/src/social/CLAUDE.md',
        },
      ],
    );
  });

  it('rejects a GEMINI.md in a nested scope', () => {
    assert.deepEqual(
      summarize([
        ...conforming,
        link('apps/podcast-pipeline/src/social/GEMINI.md'),
      ]),
      [
        {
          type: 'agent_entry_point_unexpected',
          file: 'apps/podcast-pipeline/src/social/GEMINI.md',
        },
      ],
    );
  });

  it('treats the intermediate apps/ and packages/ scopes as nested', () => {
    assert.deepEqual(summarize(without(conforming, 'packages/CLAUDE.md')), [
      { type: 'agent_entry_point_missing', file: 'packages/CLAUDE.md' },
    ]);
  });

  it('rejects a regular-file CLAUDE.md at a workspace root', () => {
    assert.deepEqual(
      summarize(replacing(conforming, file('apps/app/CLAUDE.md'))),
      [{ type: 'agent_entry_point_not_symlink', file: 'apps/app/CLAUDE.md' }],
    );
  });

  it('requires both CLAUDE.md and GEMINI.md at the repo root and workspace roots', () => {
    assert.deepEqual(
      summarize(
        without(without(conforming, 'GEMINI.md'), 'packages/types/CLAUDE.md'),
      ),
      [
        { type: 'agent_entry_point_missing', file: 'GEMINI.md' },
        { type: 'agent_entry_point_missing', file: 'packages/types/CLAUDE.md' },
      ],
    );
  });

  it('rejects a workspace-root symlink that points anywhere but AGENTS.md', () => {
    const issues = checkAgentEntryPoints(
      replacing(conforming, link('packages/types/GEMINI.md', 'CLAUDE.md')),
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, 'agent_entry_point_target');
    assert.equal(issues[0].file, 'packages/types/GEMINI.md');
    assert.match(issues[0].issue, /points to "CLAUDE\.md"/);
  });

  it('rejects an AGENTS.md that is itself a symlink', () => {
    assert.deepEqual(
      summarize(
        replacing(
          conforming,
          link('apps/podcast-pipeline/src/social/AGENTS.md', 'CLAUDE.md'),
        ),
      ),
      [
        {
          type: 'agent_instructions_symlink',
          file: 'apps/podcast-pipeline/src/social/AGENTS.md',
        },
      ],
    );
  });

  it('rejects an entry point with no AGENTS.md beside it', () => {
    assert.deepEqual(summarize([...conforming, link('docs/GEMINI.md')]), [
      { type: 'agent_entry_point_orphan', file: 'docs/GEMINI.md' },
    ]);
  });
});

describe('readIndexEntries', () => {
  it('reads modes and link targets from the index, ignoring untracked files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'config-drift-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    try {
      git('init', '-q');
      await mkdir(join(root, 'apps', 'web', 'src'), { recursive: true });
      await writeFile(join(root, 'apps', 'web', 'AGENTS.md'), '# web\n');
      await symlink('AGENTS.md', join(root, 'apps', 'web', 'CLAUDE.md'));
      await symlink('AGENTS.md', join(root, 'apps', 'web', 'GEMINI.md'));
      await writeFile(join(root, 'apps', 'web', 'src', 'AGENTS.md'), '# src\n');
      await writeFile(join(root, 'apps', 'web', 'src', 'CLAUDE.md'), POINTER);
      git(
        'add',
        'apps/web/AGENTS.md',
        'apps/web/CLAUDE.md',
        'apps/web/src/AGENTS.md',
        'apps/web/src/CLAUDE.md',
      );

      const entries = readIndexEntries(root).sort((a, b) =>
        a.path.localeCompare(b.path),
      );

      assert.deepEqual(entries, [
        { path: 'apps/web/AGENTS.md', mode: '100644' },
        { path: 'apps/web/CLAUDE.md', mode: '120000', content: 'AGENTS.md' },
        { path: 'apps/web/src/AGENTS.md', mode: '100644' },
        { path: 'apps/web/src/CLAUDE.md', mode: '100644', content: POINTER },
      ]);
      assert.deepEqual(summarize(entries), [
        { type: 'agent_entry_point_missing', file: 'apps/web/GEMINI.md' },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

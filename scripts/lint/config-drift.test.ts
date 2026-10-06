import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  checkSkillsLink,
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

describe('checkSkillsLink', () => {
  const skills = link('.claude/skills', '../.agents/skills');
  const types = (entries: IndexEntry[]) =>
    checkSkillsLink(entries).map(({ type }) => type);

  it('accepts .claude/skills as a symlink to ../.agents/skills', () => {
    assert.deepEqual(types([skills]), []);
  });

  it('requires the symlink to be tracked', () => {
    assert.deepEqual(types([]), ['skills_link_missing']);
  });

  it('rejects a real directory copied into .claude/skills', () => {
    assert.deepEqual(types([file('.claude/skills/ops-sweep/SKILL.md')]), [
      'skills_link_not_symlink',
    ]);
  });

  it('rejects a regular file where the symlink belongs', () => {
    assert.deepEqual(types([pointer('.claude/skills', '../.agents/skills')]), [
      'skills_link_not_symlink',
    ]);
  });

  it('rejects a symlink to anything but ../.agents/skills', () => {
    assert.deepEqual(types([link('.claude/skills', '../skills')]), [
      'skills_link_target',
    ]);
  });
});

describe('readIndexEntries', () => {
  it('reads the skills link mode and target from the index', async () => {
    const root = await mkdtemp(join(tmpdir(), 'config-drift-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    try {
      git('init', '-q');
      await mkdir(join(root, '.claude'));
      await symlink('../.agents/skills', join(root, '.claude', 'skills'));
      await writeFile(join(root, 'README.md'), '# readme\n');
      git('add', '.claude/skills', 'README.md');

      assert.deepEqual(readIndexEntries(root), [
        {
          path: '.claude/skills',
          mode: '120000',
          content: '../.agents/skills',
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

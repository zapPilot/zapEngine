import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findRepoRoot } from './repo-root.js';

describe('findRepoRoot coverage', () => {
  it('returns the start dir itself when it already holds the workspace marker', () => {
    const root = findRepoRoot(import.meta.dirname);
    expect(findRepoRoot(root)).toBe(root);
  });

  it('throws when no workspace marker exists above the start dir', () => {
    const lonely = mkdtempSync(join(tmpdir(), 'cc-no-workspace-'));
    expect(() => findRepoRoot(join(lonely, 'a', 'b'))).toThrow(
      /no pnpm-workspace\.yaml above/u,
    );
  });
});

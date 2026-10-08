import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadTokens } from '../src/tokens.js';
it('documents the canonical paper and night role values without palette drift', () => {
  const guide = readFileSync(new URL('../BRAND.md', import.meta.url), 'utf8');
  const tokens = loadTokens();
  const rows = [
    ...guide.matchAll(
      /\|\s*([\w /-]+?)\s*\|\s*(#[\da-f]{6})\s*\|\s*(#[\da-f]{6})\s*\|/gi,
    ),
  ];
  expect(rows).toHaveLength(10);
  for (const row of rows) {
    const roles = row[1]!
      .split('/')
      .map((role) => role.trim()) as (keyof typeof tokens.mode.paper)[];
    for (const role of roles) {
      expect(row[2], role).toBe(tokens.mode.paper[role]);
      expect(row[3], role).toBe(tokens.mode.night[role]);
    }
  }
});

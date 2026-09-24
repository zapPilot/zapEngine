import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260924053500_legacy_rednote_title_overrides.sql',
  ),
  'utf8',
);

describe('legacy Rednote title override migration', () => {
  it('adds a nullable migration-only field with no default for future jobs', () => {
    expect(migration).toMatch(
      /add column if not exists legacy_title_override text;/i,
    );
    expect(migration).not.toMatch(/legacy_title_override text default/i);
    expect(migration).toMatch(/new jobs must leave this null/i);
  });

  it('allows overrides only on Traditional Chinese Rednote lanes and caps them at 20 characters', () => {
    expect(migration).toMatch(/platform = 'rednote'/i);
    expect(migration).toMatch(/language_code = 'zh-Hant'/i);
    expect(migration).toMatch(
      /char_length\(legacy_title_override\) between 1 and 20/i,
    );

    const overrides = [
      ...migration.matchAll(/when '[0-9a-f-]+'::uuid then '([^']+)'/giu),
    ].map((match) => match[1] ?? '');

    expect(overrides).toHaveLength(26);
    for (const title of overrides) {
      expect(Array.from(title).length).toBeGreaterThan(0);
      expect(Array.from(title).length).toBeLessThanOrEqual(20);
    }
  });

  it('backfills only already queued or failed jobs and never rewrites episode localizations', () => {
    expect(migration).toMatch(/status in \('queued', 'failed'\)/i);
    expect(migration).not.toMatch(
      /update from_fed_to_chain\.episode_localizations/i,
    );
  });
});

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const schema = fs.readFileSync(
  path.join(repoRoot, 'apps/podcast-pipeline/supabase/schema.sql'),
  'utf8',
);
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/podcast-pipeline/supabase/migrations/027_add_youtube_social_platform.sql',
  ),
  'utf8',
);

describe('migration 027 YouTube social platform', () => {
  it('adds YouTube without rewriting earlier migrations', () => {
    expect(migration).toMatch(
      /platform in \('x', 'threads', 'rednote', 'youtube'\)/i,
    );
    expect(migration).toMatch(
      /platform in \('rednote', 'youtube'\)[\s\S]+generated_title/i,
    );
    expect(migration).toMatch(
      /platform in \('rednote', 'youtube'\)[\s\S]+video_duration_sec is not null/i,
    );
  });

  it('keeps the consolidated schema on the YouTube-aware constraints', () => {
    expect(schema).toMatch(
      /platform in \('x', 'threads', 'rednote', 'youtube'\)/i,
    );
    expect(schema).toMatch(
      /platform in \('rednote', 'youtube'\)[\s\S]+generated_title/i,
    );
    expect(schema).toMatch(
      /platform in \('rednote', 'youtube'\)[\s\S]+video_duration_sec is not null/i,
    );
  });

  it('bounds locks and reloads the PostgREST schema cache', () => {
    expect(migration.trim()).toMatch(/^begin;/i);
    expect(migration).toMatch(/set local lock_timeout = '5s';/i);
    expect(migration).toMatch(/set local statement_timeout = '30s';/i);
    expect(migration).toMatch(/notify pgrst, 'reload schema';/i);
    expect(migration.trim()).toMatch(/commit;$/i);
  });
});

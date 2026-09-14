import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260914004500_finalize_social_language_policy.sql',
  ),
  'utf8',
);

describe('final social language policy migration', () => {
  it('rewrites the four platforms to the decided fixed languages', () => {
    expect(migration).toMatch(/when 'rednote' then 'zh-Hant'/i);
    expect(migration).toMatch(/when 'threads' then 'zh-Hant'/i);
    expect(migration).toMatch(/when 'x' then 'ja'/i);
    expect(migration).toMatch(/when 'youtube' then 'en'/i);
  });

  it('touches only intact unpublished queued four-lane cohorts after the cutover', () => {
    const normalized = migration.toLowerCase();
    expect(normalized).toContain('count(*) = 4');
    expect(normalized).toContain('count(distinct job.platform) = 4');
    expect(normalized).toContain("bool_and(job.status = 'queued')");
    expect(normalized).toContain('bool_and(job.social_post_id is null)');
    expect(normalized).toContain(
      "min(job.scheduled_at) >= '2026-09-14t00:00:00.000z'::timestamptz",
    );
    expect(normalized).toContain('from from_fed_to_chain.social_posts post');
  });

  it('clears experiment and stale strategy identity on rewritten jobs', () => {
    const normalized = migration.toLowerCase();
    expect(normalized).toContain('experiment_key = null');
    expect(normalized).toContain('experiment_variant = null');
    expect(normalized).toContain('strategy_version_id = null');
  });

  it('removes only language-generation assignments for rewritten cohorts', () => {
    const normalized = migration.toLowerCase();
    expect(normalized).toContain(
      'delete from from_fed_to_chain.social_experiment_assignments',
    );
    expect(normalized).toContain("'x-language-v1'");
    expect(normalized).toContain("'social-language-profile-v2'");
    expect(normalized).toContain("'social-language-profile-v3'");
    expect(normalized).not.toContain("'rednote-packaging-v1-zh-hant'");
  });

  it('runs atomically', () => {
    expect(migration).toMatch(/^begin;/m);
    expect(migration).toMatch(/set local lock_timeout/i);
    expect(migration).toMatch(/set local statement_timeout/i);
    expect(migration).toMatch(/^commit;/m);
  });
});

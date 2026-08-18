import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/podcast-pipeline/supabase/migrations/029_add_social_daemon.sql',
  ),
  'utf8',
);
const batchMigration = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/podcast-pipeline/supabase/migrations/031_batch_social_publish_by_article.sql',
  ),
  'utf8',
);
const schema = fs.readFileSync(
  path.join(repoRoot, 'apps/podcast-pipeline/supabase/schema.sql'),
  'utf8',
);

const sources = [
  ['migration 029', migration],
  ['schema.sql', schema],
] as const;

describe('social daemon schema', () => {
  it('adds standardized metric windows with one durable snapshot per window', () => {
    for (const sql of [migration, schema]) {
      expect(sql).toMatch(/measurement_window text/i);
      expect(sql).toMatch(
        /'1h'[\s\S]+?'6h'[\s\S]+?'24h'[\s\S]+?'72h'[\s\S]+?'7d'/i,
      );
      expect(sql).toMatch(
        /create unique index if not exists idx_social_post_metrics_standard_window[\s\S]+?social_post_id, measurement_window[\s\S]+?where measurement_window is not null/i,
      );
    }
  });

  it.each(sources)(
    '%s persists daemon anchor, strategy versions, and publish jobs',
    (_name, sql) => {
      expect(sql).toMatch(
        /create table if not exists from_fed_to_chain\.social_daemon_state/i,
      );
      expect(sql).toMatch(/first_started_at timestamptz not null/i);
      expect(sql).toMatch(
        /create table if not exists from_fed_to_chain\.social_strategy_versions/i,
      );
      expect(sql).toMatch(/unique \(platform, version\)/i);
      expect(sql).toMatch(/idx_social_strategy_versions_one_active/i);
      expect(sql).toMatch(
        /create table if not exists from_fed_to_chain\.social_publish_jobs/i,
      );
      expect(sql).toMatch(/unique \(episode_id, platform\)/i);
      expect(sql).toMatch(
        /attempt_count integer not null default 0[\s\S]+?<= 8/i,
      );
      expect(sql).toMatch(/social_publish_jobs_processing_has_lease/i);
    },
  );

  it.each(sources)(
    '%s only exposes completed canonical video candidates',
    (_name, sql) => {
      expect(sql).toMatch(
        /create or replace view from_fed_to_chain\.social_publish_candidates/i,
      );
      expect(sql).toMatch(/localization\.language_code = 'zh-Hant'/i);
      expect(sql).toMatch(/localization\.status = 'completed'/i);
      expect(sql).toMatch(/video\.status = 'completed'/i);
      expect(sql).toMatch(/nullif\(btrim\(video\.mp4_url\), ''\) is not null/i);
      expect(sql).toMatch(/video\.duration_seconds > 0/i);
    },
  );

  it('claims one article batch atomically with skip locked and an expiring lease', () => {
    for (const sql of [batchMigration, schema]) {
      expect(sql).toMatch(
        /function from_fed_to_chain\.claim_social_publish_batch/i,
      );
      expect(sql).toMatch(/seed_episode_id/i);
      expect(sql).toMatch(/for update skip locked/i);
      expect(sql).toMatch(/lease_expires_at = p_now \+ interval '60 minutes'/i);
      expect(sql).toMatch(/attempt_count = job\.attempt_count \+ 1/i);
      expect(sql).toMatch(/job\.episode_id = seed_episode_id/i);
      expect(sql).toMatch(/job\.attempt_count < 8/i);
    }
  });

  it('keeps migration bounded, service-role-only, and reloads PostgREST', () => {
    expect(migration.trim()).toMatch(/^--[\s\S]+?begin;/i);
    expect(migration).toMatch(/set local lock_timeout = '5s'/i);
    expect(migration).toMatch(/set local statement_timeout = '30s'/i);
    expect(migration).toMatch(
      /grant all on from_fed_to_chain\.social_publish_jobs to service_role/i,
    );
    expect(migration).toMatch(
      /revoke all on from_fed_to_chain\.social_publish_jobs from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /revoke execute on function from_fed_to_chain\.claim_social_publish_job\(text, timestamptz\)[\s\S]+?from public, anon, authenticated/i,
    );
    expect(migration).toMatch(/notify pgrst, 'reload schema'/i);
    expect(migration.trim()).toMatch(/commit;$/i);
  });
});

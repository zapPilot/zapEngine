import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260905070000_social_release_operator_closure.sql',
  ),
  'utf8',
);
const normalized = migration.toLowerCase();

describe('social release operator closure migration', () => {
  it('stores an episode-level closure and makes skipped a real terminal state', () => {
    expect(normalized).toContain(
      'create table if not exists from_fed_to_chain.social_release_closures',
    );
    expect(normalized).toContain("'skipped'");
    expect(normalized).toContain(
      'create or replace function from_fed_to_chain.close_social_release',
    );
  });

  it('serializes against live publish claims before closing', () => {
    expect(normalized).toContain('for update;');
    expect(normalized).toContain("job.status = 'processing'");
    expect(normalized).toContain('job.lease_expires_at > p_now');
    expect(normalized).toContain("using errcode = '55000'");
  });

  it('keeps already-published rows and skips only unfinished jobs', () => {
    expect(normalized).toContain("status in ('queued', 'failed')");
    expect(normalized).toContain("status = 'skipped'");
    expect(normalized).not.toContain(
      'delete from from_fed_to_chain.social_posts',
    );
  });

  it('prevents discovery and waiting-media from resurrecting a closed episode', () => {
    expect(
      normalized.match(
        /from from_fed_to_chain\.social_release_closures closure/g,
      )?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
    expect(normalized).toContain('social_publish_jobs_closed_release_guard');
    expect(normalized).toContain(
      'create or replace view from_fed_to_chain.social_publish_candidates',
    );
    expect(normalized).toContain(
      'create or replace view from_fed_to_chain.social_waiting_media',
    );
  });
});

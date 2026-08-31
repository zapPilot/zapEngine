import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260830064000_add_podcast_ingest_jobs.sql',
  ),
  'utf8',
);
const emptyClaimFixMigration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260830224500_fix_podcast_ingest_claim_empty_result.sql',
  ),
  'utf8',
);

describe('podcast ingest jobs migration', () => {
  it('stores Telegram ingest work durably with lease state', () => {
    expect(migration).toMatch(
      /create table if not exists from_fed_to_chain\.podcast_ingest_jobs/i,
    );
    expect(migration).toMatch(
      /status in \('queued', 'processing', 'completed', 'failed'\)/i,
    );
    expect(migration).toMatch(/lease_owner text/i);
    expect(migration).toMatch(/lease_expires_at timestamptz/i);
    expect(migration).toMatch(/unique \(source_url, language_code\)/i);
  });

  it('claims queued work or processing work whose lease expired', () => {
    expect(migration).toMatch(
      /create or replace function from_fed_to_chain\.claim_podcast_ingest_job/i,
    );
    expect(migration).toMatch(
      /create or replace function from_fed_to_chain\.claim_next_podcast_ingest_job/i,
    );
    expect(migration).toMatch(
      /status = 'queued'[\s\S]*status = 'processing'[\s\S]*lease_expires_at <= now\(\)/i,
    );
    expect(migration).toMatch(/for update skip locked/i);
  });

  it('returns a real null when a specific job claim loses the lease race', () => {
    expect(emptyClaimFixMigration).toMatch(
      /create or replace function from_fed_to_chain\.claim_podcast_ingest_job/i,
    );
    expect(emptyClaimFixMigration).toMatch(
      /returning \* into v_job;[\s\S]*if v_job\.id is null then[\s\S]*return null;/i,
    );
  });

  it('keeps the table and queue RPCs service-role only', () => {
    expect(migration).toMatch(
      /revoke all on from_fed_to_chain\.podcast_ingest_jobs from public, anon, authenticated;/i,
    );
    expect(migration).toMatch(
      /grant all on from_fed_to_chain\.podcast_ingest_jobs to service_role;/i,
    );
    expect(migration).toMatch(
      /revoke execute on function from_fed_to_chain\.enqueue_podcast_ingest_job/i,
    );
    expect(migration).toMatch(
      /grant execute on function from_fed_to_chain\.claim_next_podcast_ingest_job/i,
    );
  });
});

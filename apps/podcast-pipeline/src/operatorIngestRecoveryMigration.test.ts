import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260903014000_operator_ingest_recovery.sql',
  ),
  'utf8',
);

describe('operator ingest recovery migration', () => {
  it('allows silent operator jobs without changing Telegram enqueue behavior', () => {
    expect(migration).toMatch(
      /alter table from_fed_to_chain\.podcast_ingest_jobs[\s\S]+?telegram_chat_id drop not null/i,
    );
    expect(migration).toMatch(
      /insert into from_fed_to_chain\.podcast_ingest_jobs[\s\S]+?'zh-Hant'[\s\S]+?null[\s\S]+?'queued'/i,
    );
  });

  it('refuses to restart completed audio or steal a live ingest lease', () => {
    expect(migration).toMatch(
      /v_completed_audio = 3[\s\S]+?Episode ingest is already completed[\s\S]+?55000/i,
    );
    expect(migration).toMatch(
      /status = 'processing'[\s\S]+?lease_expires_at > now\(\)[\s\S]+?Episode ingest is currently processing[\s\S]+?55000/i,
    );
  });

  it('reuses a durable job instead of discarding resumable checkpoints', () => {
    expect(migration).toMatch(
      /select job\.id[\s\S]+?source_url = v_source_url[\s\S]+?for update[\s\S]+?limit 1/i,
    );
    expect(migration).toMatch(
      /update from_fed_to_chain\.podcast_ingest_jobs[\s\S]+?status = 'queued'[\s\S]+?lease_owner = null[\s\S]+?last_error = null/i,
    );
    expect(migration).not.toMatch(/update from_fed_to_chain\.episode_localizations/i);
  });

  it('keeps the mutation service-role only', () => {
    expect(migration).toMatch(
      /revoke execute on function from_fed_to_chain\.retry_episode_ingest\(uuid\)[\s\S]+?from public, anon, authenticated;[\s\S]+?grant execute[\s\S]+?to service_role;/i,
    );
  });
});

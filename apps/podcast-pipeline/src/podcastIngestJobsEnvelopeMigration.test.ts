import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260830223000_harden_podcast_ingest_job_envelope.sql',
  ),
  'utf8',
);

describe('podcast ingest job envelope hardening migration', () => {
  it('makes pre-existing poison envelopes terminal before adding checks', () => {
    expect(migration).toMatch(
      /update from_fed_to_chain\.podcast_ingest_jobs[\s\S]*status = 'failed'/i,
    );
    expect(migration).toContain('lease_owner = null');
    expect(migration).toContain('lease_expires_at = null');
    expect(migration).toContain('Invalid durable ingest job envelope');
  });

  it('requires a non-whitespace HTTP source URL for recoverable jobs', () => {
    expect(migration).toContain('podcast_ingest_jobs_source_url_http_check');
    expect(migration).toContain("source_url ~* '^https?://[^[:space:]]+$'");
  });

  it('requires a non-empty Telegram chat id for recoverable jobs', () => {
    expect(migration).toContain(
      'podcast_ingest_jobs_telegram_chat_id_nonempty_check',
    );
    expect(migration).toContain("btrim(telegram_chat_id) <> ''");
  });
});

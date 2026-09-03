import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(repoRoot, 'supabase/migrations/20260903090000_podcast_ingest_restart.sql'),
  'utf8',
);

describe('podcast ingest restart migration', () => {
  it('records durable failure, lease-expiry, and requeue history', () => {
    expect(migration).toMatch(/failure_history jsonb not null default '\[\]'::jsonb/i);
    expect(migration).toMatch(/history_kind := 'failed'/i);
    expect(migration).toMatch(/history_kind := 'lease_expired'/i);
    expect(migration).toMatch(/history_kind := 'requeued'/i);
    expect(migration).toMatch(/limit 20/i);
  });

  it('keeps a known chat id when a silent operator enqueue races it', () => {
    expect(migration).toMatch(/telegram_chat_id = coalesce\([\s\S]+?excluded\.telegram_chat_id,[\s\S]+?podcast_ingest_jobs\.telegram_chat_id/i);
  });

  it('restarts only incomplete ingest checkpoints and never steals a live lease', () => {
    expect(migration).toMatch(/create or replace function from_fed_to_chain\.restart_podcast_ingest\([\s\S]+?p_language_code text default 'zh-Hant'/i);
    expect(migration).toMatch(/v_ready_languages = 3[\s\S]+?retry video generation instead[\s\S]+?22023/i);
    expect(migration).toMatch(/for update nowait[\s\S]+?lock_not_available[\s\S]+?55000/i);
  });

  it('recovers notification ownership from ingest, visual, or render rows', () => {
    expect(migration).toMatch(/from from_fed_to_chain\.podcast_ingest_jobs job[\s\S]+?job\.telegram_chat_id is not null/i);
    expect(migration).toMatch(/from from_fed_to_chain\.episode_video_visuals visual[\s\S]+?visual\.telegram_chat_id is not null/i);
    expect(migration).toMatch(/from from_fed_to_chain\.episode_videos video[\s\S]+?video\.telegram_chat_id is not null/i);
  });

  it('keeps the restart RPC service-role only and removes the superseded RPC', () => {
    expect(migration).toMatch(/drop function if exists from_fed_to_chain\.retry_episode_ingest\(uuid\)/i);
    expect(migration).toMatch(/revoke execute on function from_fed_to_chain\.restart_podcast_ingest\(uuid, text\)[\s\S]+?from public, anon, authenticated;[\s\S]+?grant execute[\s\S]+?to service_role;/i);
  });
});

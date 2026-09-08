import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260904150000_durable_video_completion_notifications.sql',
  ),
  'utf8',
);
const normalized = migration.toLowerCase();

describe('durable video completion notification migration', () => {
  it('adds a durable completion delivery stamp and pending index', () => {
    expect(normalized).toContain('completion_notified_at timestamptz');
    expect(normalized).toContain('idx_episode_videos_unnotified_completion');
    expect(normalized).toMatch(
      /where status = 'completed'[\s\S]*telegram_chat_id is not null[\s\S]*completion_notified_at is null/i,
    );
  });

  it('backfills historical completions so deploy does not replay old notifications', () => {
    expect(normalized).toMatch(
      /update from_fed_to_chain\.episode_videos video[\s\S]*set completion_notified_at = coalesce\(video\.completed_at, video\.updated_at, now\(\)\)[\s\S]*where video\.status = 'completed'/i,
    );
  });

  it('reopens notification eligibility when a render lifecycle is retried', () => {
    expect(normalized).toContain(
      'create or replace function from_fed_to_chain.reset_episode_video_completion_notification()',
    );
    expect(normalized).toContain(
      'create trigger trg_reset_episode_video_completion_notification',
    );
    expect(normalized).toContain('new.completion_notified_at := null');
  });

  it('gives the immediate sender time to acknowledge before retrying', () => {
    expect(normalized).toContain(
      "video.completed_at <= now() - interval '1 minute'",
    );
  });

  it('exposes service-role-only reap and acknowledgement RPCs', () => {
    expect(normalized).toContain('reap_completed_episode_video_notifications');
    expect(normalized).toContain('mark_episode_video_completion_notified');
    expect(normalized).toMatch(
      /revoke execute on function from_fed_to_chain\.reap_completed_episode_video_notifications\(integer\)[\s\S]*from public, anon, authenticated;[\s\S]*grant execute[\s\S]*to service_role;/i,
    );
    expect(normalized).toMatch(
      /revoke execute on function from_fed_to_chain\.mark_episode_video_completion_notified\(uuid, text\)[\s\S]*from public, anon, authenticated;[\s\S]*grant execute[\s\S]*to service_role;/i,
    );
  });
});

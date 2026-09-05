import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260905060000_podcast_pipeline_release_guard.sql',
  ),
  'utf8',
);
const normalized = migration.toLowerCase();

describe('podcast pipeline release guard migration', () => {
  it('stores a heartbeat for the running podcast release', () => {
    expect(normalized).toContain(
      'create table if not exists ops.podcast_pipeline_release_state',
    );
    expect(normalized).toContain(
      'create or replace function from_fed_to_chain.mark_podcast_pipeline_release',
    );
    expect(normalized).toContain('heartbeat_at = excluded.heartbeat_at');
  });

  it('fails closed on stale or mismatched capability', () => {
    expect(normalized).toContain("heartbeat_at < now() - interval '90 seconds'");
    expect(normalized).toContain(
      'podcast pipeline release heartbeat is missing or stale; video restart blocked',
    );
    expect(normalized).toContain(
      'podcast pipeline visual version mismatch: deployed %s, requested %s; video restart blocked',
    );
  });

  it('wraps both video recovery RPCs behind the release assertion', () => {
    expect(normalized).toContain(
      'retry_episode_video_generation_without_release_guard',
    );
    expect(normalized).toContain(
      'retry_episode_video_render_without_release_guard',
    );
    expect(normalized).toContain(
      'perform ops.assert_podcast_pipeline_visual_release(p_visual_version);',
    );
  });

  it('reloads the PostgREST schema after replacing the RPCs', () => {
    expect(normalized).toContain("notify pgrst, 'reload schema';");
    expect(normalized).toContain('grant execute on function from_fed_to_chain.retry_episode_video_generation');
    expect(normalized).toContain('grant execute on function from_fed_to_chain.retry_episode_video_render');
  });
});

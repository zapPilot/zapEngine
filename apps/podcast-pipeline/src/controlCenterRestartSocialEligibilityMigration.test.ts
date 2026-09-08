import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260904122230_control_center_restart_social_eligibility.sql',
  ),
  'utf8',
);

const normalized = migration.toLowerCase();

describe('control-center restart social eligibility migration', () => {
  it('wraps every operator pipeline recovery rpc', () => {
    expect(normalized).toContain(
      'create function from_fed_to_chain.restart_podcast_ingest',
    );
    expect(normalized).toContain(
      'create function from_fed_to_chain.retry_episode_video_generation',
    );
    expect(normalized).toContain(
      'create function from_fed_to_chain.retry_episode_video_render',
    );
    expect(normalized).toContain(
      'restart_podcast_ingest_without_social_reeligibility',
    );
    expect(normalized).toContain(
      'retry_episode_video_generation_without_social_reeligibility',
    );
    expect(normalized).toContain(
      'retry_episode_video_render_without_social_reeligibility',
    );
  });

  it('only re-ages pre-rollout episodes that have never entered social publishing', () => {
    expect(normalized).toContain(
      "episode.created_at < '2026-08-24t00:00:00.000z'::timestamptz",
    );
    expect(normalized).toMatch(
      /not exists \([\s\S]*social_publish_jobs job[\s\S]*job\.episode_id = p_episode_id[\s\S]*\)/i,
    );
    expect(normalized).toMatch(
      /not exists \([\s\S]*social_posts post[\s\S]*post\.episode_id = p_episode_id[\s\S]*\)/i,
    );
    expect(normalized).toContain('set created_at = now()');
  });

  it('keeps the eligibility mutation in the same transaction as the restart', () => {
    expect(migration).toMatch(/^begin;/m);
    expect(migration).toMatch(/set local lock_timeout/i);
    expect(migration).toMatch(/set local statement_timeout/i);
    expect(migration).toMatch(/notify pgrst, 'reload schema';/i);
    expect(migration).toMatch(/^commit;/m);
  });

  it('keeps the public recovery rpc surface service-role-only', () => {
    expect(normalized).toMatch(
      /revoke execute on function from_fed_to_chain\.restart_podcast_ingest[\s\S]*from public, anon, authenticated;/i,
    );
    expect(normalized).toMatch(
      /revoke execute on function from_fed_to_chain\.retry_episode_video_generation[\s\S]*from public, anon, authenticated;/i,
    );
    expect(normalized).toMatch(
      /revoke execute on function from_fed_to_chain\.retry_episode_video_render[\s\S]*from public, anon, authenticated;/i,
    );
  });
});

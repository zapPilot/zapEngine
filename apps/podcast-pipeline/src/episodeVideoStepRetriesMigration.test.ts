import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260903090100_episode_video_step_retries_and_failure_diagnostics.sql',
  ),
  'utf8',
);

describe('episode video step retries migration', () => {
  it('replaces the two-argument generation retry with force-replan support', () => {
    expect(migration).toMatch(
      /drop function if exists from_fed_to_chain\.retry_episode_video_generation\(uuid, text\)/i,
    );
    expect(migration).toMatch(
      /retry_episode_video_generation\([\s\S]+?p_force_replan boolean default false/i,
    );
    expect(migration).toMatch(/if not p_force_replan[\s\S]+?status = 'completed'/i);
    expect(migration).toMatch(/using errcode = '40001'/i);
  });

  it('fills missing language render rows and supports a single render retry', () => {
    expect(migration).toMatch(
      /insert into from_fed_to_chain\.episode_videos[\s\S]+?on conflict \(episode_localization_id\) do nothing/i,
    );
    expect(migration).toMatch(
      /create or replace function from_fed_to_chain\.retry_episode_video_render\([\s\S]+?for update nowait/i,
    );
    expect(migration).toMatch(/Episode video render is currently processing[\s\S]+?55000/i);
  });

  it('adds fenced checkpoint and failure-diagnostic storage', () => {
    expect(migration).toMatch(/add column if not exists checkpoint jsonb/i);
    expect(migration).toMatch(/add column if not exists last_failure_diagnostics jsonb/i);
    expect(migration).toMatch(/octet_length\(checkpoint::text\) <= 524288/i);
    expect(migration).toMatch(/octet_length\(last_failure_diagnostics::text\) <= 262144/i);
    expect(migration).toMatch(
      /save_episode_video_visual_checkpoint[\s\S]+?status = 'processing'[\s\S]+?lease_owner = p_lease_owner[\s\S]+?lease_expires_at > now\(\)/i,
    );
    expect(migration).toMatch(
      /record_episode_video_visual_failure_diagnostics[\s\S]+?status = 'processing'[\s\S]+?lease_owner = p_lease_owner[\s\S]+?lease_expires_at > now\(\)/i,
    );
  });

  it('clears progress on completion and only clears diagnostics on successful visual completion', () => {
    expect(migration).toMatch(
      /complete_episode_video_visual[\s\S]+?progress_percent = null[\s\S]+?progress_stage = null[\s\S]+?last_failure_diagnostics = null/i,
    );
    expect(migration).toMatch(
      /complete_episode_video\([\s\S]+?progress_percent = null[\s\S]+?progress_stage = null/i,
    );
    const retrySection = migration.split(
      'create or replace function from_fed_to_chain.retry_episode_video_render',
    )[0]!;
    expect(retrySection).not.toMatch(/last_failure_diagnostics = null/i);
  });
});

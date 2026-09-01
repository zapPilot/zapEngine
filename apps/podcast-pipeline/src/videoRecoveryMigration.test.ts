import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260901080500_video_visual_recovery.sql',
  ),
  'utf8',
);

describe('video visual recovery migration', () => {
  it('makes terminal visual Telegram notification durable and service-role only', () => {
    expect(migration).toMatch(
      /alter table from_fed_to_chain\.episode_video_visuals[\s\S]+?failure_notified_at timestamptz/i,
    );
    expect(migration).toMatch(
      /reap_failed_episode_video_visual_notifications[\s\S]+?status = 'failed'[\s\S]+?failure_notified_at is null/i,
    );
    expect(migration).toMatch(
      /mark_episode_video_visual_failure_notified[\s\S]+?set failure_notified_at = now\(\)/i,
    );
    expect(migration).toMatch(
      /revoke execute on function from_fed_to_chain\.retry_episode_video_generation\(uuid\)[\s\S]+?from public, anon, authenticated;[\s\S]+?grant execute[\s\S]+?to service_role;/i,
    );
  });

  it('re-arms notification when a terminal visual is retried by any path', () => {
    expect(migration).toMatch(
      /if old\.status = 'failed' and new\.status <> 'failed' then[\s\S]+?new\.failure_notified_at := null/i,
    );
    expect(migration).toMatch(
      /before update of status on from_fed_to_chain\.episode_video_visuals/i,
    );
  });

  it('refuses to clear either a live visual lease or a live localized render lease', () => {
    expect(migration).toMatch(
      /visual_record\.status = 'processing'[\s\S]+?visual_record\.lease_expires_at > now\(\)[\s\S]+?currently processing/i,
    );
    expect(migration).toMatch(
      /from from_fed_to_chain\.episode_videos video[\s\S]+?video\.status = 'processing'[\s\S]+?video\.lease_expires_at > now\(\)[\s\S]+?currently processing/i,
    );
  });

  it('preserves completed visual and language checkpoints while retrying only unfinished renders', () => {
    const branchPattern =
      /if visual_record\.status = 'completed' then([\s\S]+?)return true;\s+end if;/i;
    const completedVisualBranch = branchPattern.exec(migration)?.[1];
    expect(completedVisualBranch).toBeTruthy();
    expect(completedVisualBranch).toMatch(
      /video\.status <> 'completed'[\s\S]+?visual_hash = visual_record\.visual_hash[\s\S]+?attempt_count = 0/i,
    );
    expect(completedVisualBranch).not.toMatch(
      /update from_fed_to_chain\.episode_video_visuals/i,
    );
    expect(migration).toMatch(/Episode video generation is already completed/i);
  });

  it('clears downstream checkpoint references before requeueing a failed shared visual', () => {
    const downstreamReset = migration.indexOf(
      'update from_fed_to_chain.episode_videos video',
      migration.indexOf('An incomplete/failed shared visual'),
    );
    const visualReset = migration.indexOf(
      'update from_fed_to_chain.episode_video_visuals visual',
      downstreamReset,
    );
    expect(downstreamReset).toBeGreaterThan(-1);
    expect(visualReset).toBeGreaterThan(downstreamReset);
    expect(migration.slice(downstreamReset, visualReset)).toContain(
      'visual_hash = null',
    );
  });
});

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
      /revoke execute on function from_fed_to_chain\.retry_episode_video_generation\(uuid, text\)[\s\S]+?from public, anon, authenticated;[\s\S]+?grant execute[\s\S]+?to service_role;/i,
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
    expect(migration).toMatch(
      /video\.status <> 'completed'[\s\S]+?and not \([\s\S]+?video\.status = 'processing'[\s\S]+?video\.lease_expires_at > now\(\)/i,
    );
  });

  it("stamps the caller's visual version so a stale checkpoint is repaired, not resurrected", () => {
    // Both claim RPCs fence on visual_version. Requeueing under an old version
    // is never claimed again, and leaving 'failed' also stops the alert.
    expect(migration).toMatch(
      /retry_episode_video_generation\(\s+p_episode_id uuid,\s+p_visual_version text default null\s+\)/i,
    );
    // A completed checkpoint from an older version must fall through to the
    // re-plan path rather than being stamped back onto the renders.
    expect(migration).toMatch(
      /if visual_record\.status = 'completed'\s+and \(\s+target_visual_version is null\s+or visual_record\.visual_version = target_visual_version\s+\) then/i,
    );
    const replanAt = migration.indexOf('An incomplete/failed shared visual');
    expect(replanAt).toBeGreaterThan(-1);
    expect(migration.slice(replanAt)).toMatch(
      /visual_version = coalesce\(\s+target_visual_version,\s+visual_record\.visual_version\s+\)[\s\S]+?update from_fed_to_chain\.episode_video_visuals visual[\s\S]+?visual_version = coalesce\(\s+target_visual_version,\s+visual\.visual_version\s+\)/i,
    );
    // The one-argument overload must not survive, or a caller that forgets the
    // version resolves to it and silently keeps the stale one.
    expect(migration).toMatch(
      /drop function if exists from_fed_to_chain\.retry_episode_video_generation\(uuid\);/i,
    );
  });

  it('locks every render row before deciding what to requeue', () => {
    // `claim_episode_video_v2` locks only `episode_videos`, so the visual-row
    // lock cannot serialise a concurrent claim/complete/fail on a render.
    expect(migration).toMatch(
      /perform 1\s+from from_fed_to_chain\.episode_videos video\s+where video\.episode_id = p_episode_id\s+order by video\.episode_localization_id\s+for update nowait;/i,
    );
    const lockAt = migration.search(
      /perform 1\s+from from_fed_to_chain\.episode_videos video/i,
    );
    const leasePreflightAt = migration.indexOf(
      'a service-role caller must not be able to clear a live ffmpeg/render',
    );
    expect(lockAt).toBeGreaterThan(-1);
    expect(leasePreflightAt).toBeGreaterThan(lockAt);
  });

  it('never waits on a render row it does not hold', () => {
    // The claim RPC opens with a waiting, unordered expired-lease reap UPDATE.
    // A waiting lock here deadlocks against it and kills the worker's claim, so
    // the conflict must surface as the operator-facing 55000 instead.
    expect(migration).toMatch(
      /for update nowait;\s+exception\s+when lock_not_available then\s+raise exception 'Episode video generation is currently processing'\s+using errcode = '55000';/i,
    );
  });

  it('refuses to report success while any render is left unqueued', () => {
    const branchPattern =
      /if visual_record\.status = 'completed'\s+and \([\s\S]+?\) then([\s\S]+?)return true;\s+end if;/i;
    const completedVisualBranch = branchPattern.exec(migration)?.[1];
    expect(completedVisualBranch).toMatch(
      /video\.status not in \('completed', 'queued'\)[\s\S]+?raise exception 'Episode video retry could not requeue every unfinished render'[\s\S]+?errcode = '40001'/i,
    );
    // '55000' is the operator-facing conflict the route answers with a bare 409
    // and no telemetry, so an assertion breach must not share it.
    expect(completedVisualBranch).not.toMatch(
      /could not requeue every unfinished render'\s+using errcode = '55000'/i,
    );
  });

  it('preserves completed visual and language checkpoints while retrying only unfinished renders', () => {
    const branchPattern =
      /if visual_record\.status = 'completed'\s+and \([\s\S]+?\) then([\s\S]+?)return true;\s+end if;/i;
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

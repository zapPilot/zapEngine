import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260914123000_social_waiting_media_progress.sql',
  ),
  'utf8',
);
const normalized = migration.toLowerCase();

describe('social waiting-media progress migration', () => {
  it('removes terminal abandoned video pipelines from waiting media', () => {
    expect(normalized).toContain(
      'create or replace view from_fed_to_chain.social_waiting_media',
    );
    expect(normalized).toContain(
      'from from_fed_to_chain.episode_video_visuals visual',
    );
    expect(normalized).toContain('visual.episode_id = episode.id');
    expect(normalized).toContain('visual.abandoned_at is not null');
  });

  it('preserves the existing publish, post, and release-closure fences', () => {
    expect(normalized).toContain(
      'from from_fed_to_chain.social_publish_jobs job',
    );
    expect(normalized).toContain('from from_fed_to_chain.social_posts post');
    expect(normalized).toContain(
      'from from_fed_to_chain.social_release_closures closure',
    );
  });

  // Every input `claim_episode_video_v2` fences on, so Control Center can tell a
  // lane that is merely slow from one no worker will ever take.
  it.each([
    'greatest(episode.created_at, localization.created_at) as waiting_since',
    'video.updated_at as last_progress_at',
    'video.status as render_status',
    'video.attempt_count as render_attempt_count',
    'video.next_attempt_at as render_next_attempt_at',
    'video.lease_expires_at as render_lease_expires_at',
    'video.visual_version as render_visual_version',
    'video.visual_hash as render_visual_hash',
    'progress_visual.status as visual_status',
    'progress_visual.visual_version as visual_version',
    'progress_visual.visual_hash as visual_hash',
  ])('exposes progress fact %s', (expression) => {
    expect(normalized).toContain(expression);
  });

  it('keeps the original six columns ahead of every appended one', () => {
    const original = normalized.indexOf('as experiment_variant');
    const firstAppended = normalized.indexOf('as waiting_since');
    // `create or replace view` refuses a renamed or reordered existing column,
    // and `daemon-store.ts` selects `episode_id,language_code` by name.
    expect(original).toBeGreaterThan(-1);
    expect(firstAppended).toBeGreaterThan(original);
  });

  it('joins the visual checkpoint on its primary key so the row count cannot change', () => {
    // `episode_video_visuals` is keyed by `episode_id`, so this join is at most
    // 1:1. Any other predicate could multiply lanes and inflate every count.
    expect(normalized).toContain(
      'left join from_fed_to_chain.episode_video_visuals progress_visual\n  on progress_visual.episode_id = episode.id',
    );
  });

  it('carries facts only, never claim policy', () => {
    // `20260828143000` had to undo a second copy of the language policy that had
    // drifted from the one `src/social/policy.ts` owns. Eligibility belongs to
    // `apps/control-center/src/server/services/podcast-retry-eligibility.ts`.
    for (const policy of [
      'podcast-image-visual-plan',
      'podcast_pipeline_release_state',
      'as blocked',
      'as claimable',
      'attempt_count <',
      'attempt_count >=',
    ]) {
      expect(normalized).not.toContain(policy);
    }
  });

  it('runs in one transaction, re-grants service_role, and reloads PostgREST', () => {
    expect(normalized).toContain('begin;');
    expect(normalized).toContain("set local lock_timeout = '5s'");
    expect(normalized).toContain("set local statement_timeout = '30s'");
    expect(normalized).toContain(
      'grant select on from_fed_to_chain.social_waiting_media to service_role',
    );
    expect(normalized).toContain("notify pgrst, 'reload schema'");
    expect(normalized).toContain('commit;');
  });
});

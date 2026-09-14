import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260914123000_social_waiting_media_exclude_abandoned.sql',
  ),
  'utf8',
);
const normalized = migration.toLowerCase();

describe('social waiting-media abandoned pipeline migration', () => {
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
});

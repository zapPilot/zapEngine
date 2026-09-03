import fs from 'node:fs';
import path from 'node:path';

import {
  PODCAST_VIDEO_REVIEW_ISSUES,
  PODCAST_VIDEO_REVIEW_STATUSES,
  PODCAST_VIDEO_REVIEW_VERDICTS,
} from '@zapengine/types/shared';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(repoRoot, 'supabase/migrations/20260903090200_add_episode_video_reviews.sql'),
  'utf8',
);

describe('episode video reviews migration', () => {
  it('keeps SQL review vocabulary in parity with shared types', () => {
    for (const verdict of PODCAST_VIDEO_REVIEW_VERDICTS) {
      expect(migration).toContain(`'${verdict}'`);
    }
    for (const issue of PODCAST_VIDEO_REVIEW_ISSUES) {
      expect(migration).toContain(`'${issue}'`);
    }
    for (const status of PODCAST_VIDEO_REVIEW_STATUSES) {
      expect(migration).toContain(`'${status}'`);
    }
  });

  it('uses an idempotent coalesced review scope', () => {
    expect(migration).toMatch(/episode_video_reviews_scope_unique[\s\S]+?coalesce\(visual_hash, ''\)[\s\S]+?coalesce\(language_code, ''\)[\s\S]+?coalesce\(scene_id, ''\)[\s\S]+?reviewer/i);
    expect(migration).toMatch(/on conflict \([\s\S]+?coalesce\(visual_hash, ''\)[\s\S]+?reviewer[\s\S]+?do update/i);
  });

  it('bounds review context and exposes only named service-role mutations', () => {
    expect(migration).toMatch(/octet_length\(pipeline_context::text\) <= 8192/i);
    expect(migration).toMatch(/upsert_episode_video_review/i);
    expect(migration).toMatch(/resolve_episode_video_review/i);
    expect(migration).toMatch(/revoke all on from_fed_to_chain\.episode_video_reviews from public, anon, authenticated/i);
  });
});

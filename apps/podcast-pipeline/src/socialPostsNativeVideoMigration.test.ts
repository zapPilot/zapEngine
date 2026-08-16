import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/podcast-pipeline/supabase/migrations/026_allow_native_video_duration_telemetry.sql',
  ),
  'utf8',
);

describe('migration 026 native-video telemetry', () => {
  it('keeps Rednote strict while permitting positive X and Threads durations', () => {
    expect(migration).toMatch(
      /drop constraint if exists social_posts_video_matches_platform/i,
    );
    expect(migration).toMatch(
      /platform = 'rednote'[\s\S]+?video_duration_sec is not null[\s\S]+?video_duration_sec > 0/i,
    );
    expect(migration).toMatch(
      /platform <> 'rednote'[\s\S]+?video_duration_sec is null[\s\S]+?or video_duration_sec > 0/i,
    );
  });

  it('bounds locks and reloads the PostgREST schema cache', () => {
    expect(migration.trim()).toMatch(/^begin;/i);
    expect(migration).toMatch(/set local lock_timeout = '5s';/i);
    expect(migration).toMatch(/set local statement_timeout = '30s';/i);
    expect(migration).toMatch(/notify pgrst, 'reload schema';/i);
    expect(migration.trim()).toMatch(/commit;$/i);
  });
});

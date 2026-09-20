import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260920111500_group_video_completion_notifications.sql',
  ),
  'utf8',
);
const normalized = migration.toLowerCase();

describe('grouped video completion notification migration', () => {
  it('reaps only episodes whose three language videos are completed', () => {
    expect(normalized).toContain(
      'reap_completed_episode_video_notification_groups',
    );
    expect(normalized).toContain(
      "localization.language_code in ('zh-hant', 'ja', 'en')",
    );
    expect(normalized).toContain(
      'count(distinct localization.language_code) = 3',
    );
    expect(normalized).toContain("bool_and(video.status = 'completed')");
    expect(normalized).toContain(
      'bool_or(video.completion_notified_at is null)',
    );
  });

  it('acknowledges all completed language rows with one episode-level stamp', () => {
    expect(normalized).toContain(
      'mark_episode_video_completion_group_notified',
    );
    expect(normalized).toMatch(
      /localization\.episode_id = p_episode_id[\s\S]*localization\.language_code in \('zh-hant', 'ja', 'en'\)[\s\S]*video\.completion_notified_at is null/i,
    );
  });

  it('keeps grouped RPCs service-role only', () => {
    expect(normalized).toMatch(
      /revoke execute on function from_fed_to_chain\.reap_completed_episode_video_notification_groups\(integer\)[\s\S]*grant execute[\s\S]*to service_role;/i,
    );
    expect(normalized).toMatch(
      /revoke execute on function from_fed_to_chain\.mark_episode_video_completion_group_notified\(uuid\)[\s\S]*grant execute[\s\S]*to service_role;/i,
    );
  });
});

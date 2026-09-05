import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const readMigration = (file: string) =>
  fs
    .readFileSync(path.join(repoRoot, 'supabase/migrations', file), 'utf8')
    .toLowerCase();

const guard = readMigration(
  '20260905120000_abandon_episode_video_pipeline.sql',
);
const data = readMigration(
  '20260905120100_abandon_legacy_zh_only_episode_videos.sql',
);

describe('episode video abandon migration', () => {
  it('stores the abandon marker as an all-or-nothing pair', () => {
    expect(guard).toContain(
      'add column if not exists abandoned_at timestamptz',
    );
    expect(guard).toContain('add column if not exists abandoned_reason text');
    expect(guard).toContain(
      "check ((abandoned_at is null) = (nullif(btrim(abandoned_reason), '') is null))",
    );
  });

  it('raises a restart-blocked error an operator can read', () => {
    expect(guard).toContain(
      'create or replace function from_fed_to_chain.assert_episode_video_not_abandoned',
    );
    expect(guard).toContain(
      'episode video generation was abandoned by an operator; restart blocked',
    );
    expect(guard).toContain("errcode = '22023'");
    expect(guard).toContain('hint = v_abandoned_reason');
  });

  it('keeps the internal assertion off every data api role', () => {
    expect(guard).toContain(
      'revoke execute on function from_fed_to_chain.assert_episode_video_not_abandoned(uuid)\n  from public, anon, authenticated, service_role;',
    );
  });

  it('checks the abandon marker before the release fence on both retry rpcs', () => {
    for (const wrapper of [
      'retry_episode_video_generation',
      'retry_episode_video_render',
    ]) {
      const body = guard.slice(
        guard.indexOf(
          `create or replace function from_fed_to_chain.${wrapper}(`,
        ),
      );
      const abandonAt = body.indexOf(
        'perform from_fed_to_chain.assert_episode_video_not_abandoned(p_episode_id);',
      );
      const releaseAt = body.indexOf(
        'perform ops.assert_podcast_pipeline_visual_release(p_visual_version);',
      );
      expect(abandonAt).toBeGreaterThanOrEqual(0);
      expect(releaseAt).toBeGreaterThan(abandonAt);
      expect(body).toContain(`${wrapper}_without_release_guard(`);
    }
  });

  it('keeps both retry rpcs callable by service_role and reloads postgrest', () => {
    expect(guard).toContain(
      'grant execute on function from_fed_to_chain.retry_episode_video_generation(uuid, text, boolean)\n  to service_role;',
    );
    expect(guard).toContain(
      'grant execute on function from_fed_to_chain.retry_episode_video_render(uuid, uuid, text)\n  to service_role;',
    );
    expect(guard).toContain("notify pgrst, 'reload schema';");
  });
});

describe('legacy zh-Hant-only abandon data migration', () => {
  const episodeIds = [...data.matchAll(/'([0-9a-f-]{36})'/g)].map(
    ([, id]) => id,
  );

  it('closes the 43 legacy zh-Hant-only episodes and the unalignable one', () => {
    expect(new Set(episodeIds).size).toBe(44);
    expect(episodeIds).toContain('7e7ec8d8-1407-48b7-8af4-3a8c469bb282');
    expect(episodeIds).toContain('c1b8adfe-0dce-4f75-a49e-3ccdfbac03bf');
    expect(episodeIds).toContain('67613f01-4532-454b-85fc-4f2a6f06f49b');
  });

  it('names why each cohort was closed', () => {
    expect(data).toContain(
      'legacy zh-hant-only render: ja/en were never rendered and zh-hant was already released',
    );
    expect(data).toContain(
      'ja render cannot align (46 localized sentences < 62 storyboard scenes)',
    );
  });

  it('re-runs without re-stamping an already abandoned episode', () => {
    const updates = data.match(/where abandoned_at is null/g) ?? [];
    expect(updates).toHaveLength(2);
  });
});

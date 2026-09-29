import { describe, expect, it } from 'vitest';

import type { EpisodeListRow } from '../types.js';
import { rankEpisodeSearchResults } from './episode-search.js';
import { PODCAST_INTRO } from './podcast-packaging.js';

function row(overrides: Partial<EpisodeListRow> = {}): EpisodeListRow {
  const id = overrides.id ?? '00000000-0000-4000-8000-000000000001';
  return {
    id,
    episode_id: overrides.episode_id ?? id,
    localization_id: overrides.localization_id ?? `localization-${id}`,
    language_code: overrides.language_code ?? 'en',
    title: overrides.title ?? 'Episode title',
    hls_url: overrides.hls_url ?? 'https://cdn.example.com/episode.m3u8',
    classroom_hls_url: overrides.classroom_hls_url ?? null,
    script:
      overrides.script === undefined ? 'Episode script.' : overrides.script,
    llm_model: overrides.llm_model ?? null,
    llm_thinking_model: overrides.llm_thinking_model ?? null,
    llm_provider: overrides.llm_provider ?? null,
    status: overrides.status ?? 'completed',
    created_at: overrides.created_at ?? '2026-06-01T00:00:00.000Z',
    like_count: overrides.like_count ?? 0,
    language_classrooms: overrides.language_classrooms ?? [],
  };
}

describe('rankEpisodeSearchResults coverage', () => {
  it('falls back to the trimmed script when every paragraph is the packaged intro', () => {
    const result = rankEpisodeSearchResults(
      [row({ title: 'Stablecoin regulation', script: PODCAST_INTRO })],
      'stablecoin regulation',
      20,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.matchSource).toBe('title');
    expect(result[0]?.snippet).toBe(PODCAST_INTRO);
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { EpisodeListRow } from '../types.js';
import { encodeCursor } from './db.js';
import {
  createEpisodeSearchService,
  rankEpisodeSearchResults,
} from './episode-search.js';

describe('rankEpisodeSearchResults', () => {
  it('finds exact fragments in Traditional Chinese and Japanese', () => {
    const rows = [
      row({
        id: 'zh',
        title: '聯準會流動性觀察',
        script: '本集討論市場資金與銀行準備金。',
      }),
      row({
        id: 'ja',
        title: '市場の流動性を読む',
        script: '中央銀行の政策を解説します。',
      }),
    ];

    expect(rankEpisodeSearchResults(rows, '流動性', 20)).toEqual([
      expect.objectContaining({ row: rows[0], matchSource: 'title' }),
      expect.objectContaining({ row: rows[1], matchSource: 'title' }),
    ]);
  });

  it('normalizes English case and punctuation', () => {
    const result = rankEpisodeSearchResults(
      [
        row({
          title: 'The Fed’s Balance-Sheet',
          script: 'Liquidity conditions are changing.',
        }),
      ],
      'FED BALANCE sheet',
      20,
    );

    expect(result).toEqual([expect.objectContaining({ matchSource: 'title' })]);
  });

  it('tolerates a small English spelling error', () => {
    const result = rankEpisodeSearchResults(
      [
        row({
          title: 'Treasury liquidity watch',
          script: 'Funding markets stayed calm.',
        }),
      ],
      'liqidity',
      20,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.matchSource).toBe('title');
  });

  it('ranks a title match ahead of a script-only match', () => {
    const titleMatch = row({
      id: 'title',
      title: 'Stablecoin regulation',
      script: 'A short introduction.',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const scriptMatch = row({
      id: 'script',
      title: 'Weekly market notes',
      script: 'The episode closes with stablecoin regulation.',
      created_at: '2026-06-01T00:00:00.000Z',
    });

    const result = rankEpisodeSearchResults(
      [scriptMatch, titleMatch],
      'stablecoin regulation',
      20,
    );

    expect(result.map((item) => item.row.id)).toEqual(['title', 'script']);
  });

  it('uses the closest script sentence and caps snippets at 180 characters', () => {
    const matchingSentence =
      'Liquidity transmission changed after the Treasury rebuilt its cash balance and reserves moved through funding markets ';
    const result = rankEpisodeSearchResults(
      [
        row({
          title: 'Weekly notes',
          script: `Unrelated opening. ${matchingSentence.repeat(5)}Closing.`,
        }),
      ],
      'Treasury rebuilt',
      20,
    );

    expect(result[0]?.matchSource).toBe('script');
    expect(result[0]?.snippet).toContain('Treasury rebuilt');
    expect(Array.from(result[0]?.snippet ?? '')).toHaveLength(180);
  });

  it('requires an exact fragment for two-character queries', () => {
    const result = rankEpisodeSearchResults(
      [row({ title: 'Federal liquidity', script: 'Market conditions.' })],
      'fx',
      20,
    );

    expect(result).toEqual([]);
  });

  it('filters unrelated rows and handles null scripts', () => {
    const result = rankEpisodeSearchResults(
      [row({ title: 'Bitcoin custody', script: null })],
      'monetary policy',
      20,
    );

    expect(result).toEqual([]);
  });
});

describe('EpisodeSearchService', () => {
  it('reuses a language corpus until the five-minute TTL expires', async () => {
    let now = 1_000;
    const loadPage = vi.fn().mockResolvedValue({
      rows: [row({ title: 'Liquidity watch' })],
      nextCursor: null,
    });
    const service = createEpisodeSearchService({
      loadPage,
      now: () => now,
    });

    await service.search('liquidity', 'en', 20);
    now += 299_999;
    await service.search('liquidity', 'en', 20);
    now += 2;
    await service.search('liquidity', 'en', 20);

    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it('shares one cold corpus load across concurrent searches', async () => {
    let resolvePage:
      | ((page: { rows: EpisodeListRow[]; nextCursor: null }) => void)
      | undefined;
    const loadPage = vi.fn(
      () =>
        new Promise<{ rows: EpisodeListRow[]; nextCursor: null }>((resolve) => {
          resolvePage = resolve;
        }),
    );
    const service = createEpisodeSearchService({ loadPage });

    const first = service.search('liquidity', 'en', 20);
    const second = service.search('treasury', 'en', 20);
    resolvePage?.({
      rows: [row({ title: 'Treasury liquidity' })],
      nextCursor: null,
    });

    await Promise.all([first, second]);
    expect(loadPage).toHaveBeenCalledTimes(1);
  });

  it('loads every page and invalidates all language caches', async () => {
    const nextCursor = encodeCursor({
      t: '2026-01-01T00:00:00.000Z',
      i: '00000000-0000-4000-8000-000000000001',
    });
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [row({ id: 'first', title: 'Liquidity first' })],
        nextCursor,
      })
      .mockResolvedValueOnce({
        rows: [row({ id: 'second', title: 'Liquidity second' })],
        nextCursor: null,
      })
      .mockResolvedValue({
        rows: [row({ id: 'fresh', title: 'Liquidity fresh' })],
        nextCursor: null,
      });
    const service = createEpisodeSearchService({ loadPage });

    const initial = await service.search('liquidity', 'en', 20);
    service.invalidate();
    const refreshed = await service.search('liquidity', 'en', 20);

    expect(initial).toHaveLength(2);
    expect(refreshed[0]?.episode.id).toBe('fresh');
    expect(loadPage).toHaveBeenCalledTimes(3);
    expect(loadPage.mock.calls[1]?.[1]).toEqual({
      t: '2026-01-01T00:00:00.000Z',
      i: '00000000-0000-4000-8000-000000000001',
    });
  });
});

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
    listened: overrides.listened ?? false,
    like_count: overrides.like_count ?? 0,
    language_classrooms: overrides.language_classrooms ?? [],
  };
}

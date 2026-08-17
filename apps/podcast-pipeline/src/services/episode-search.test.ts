import { describe, expect, it, vi } from 'vitest';

import type { EpisodeListRow } from '../types.js';
import { encodeCursor } from './db.js';
import {
  createEpisodeSearchService,
  invalidateEpisodeSearchCache,
  rankEpisodeSearchResults,
  searchEpisodes,
} from './episode-search.js';

vi.mock('./db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db.js')>();
  return {
    ...actual,
    listEpisodesPaged: vi
      .fn()
      .mockResolvedValue({ rows: [], nextCursor: null }),
  };
});

describe('rankEpisodeSearchResults', () => {
  it('returns no results for punctuation-only queries and empty titles', () => {
    expect(
      rankEpisodeSearchResults(
        [row({ title: '', script: null })],
        '--- !!!',
        20,
      ),
    ).toEqual([]);
  });

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

  it('covers exact, prefix, and contains scoring for title and script matches', () => {
    const exactTitle = row({ id: 'exact-title', title: 'alpha', script: null });
    const prefixTitle = row({
      id: 'prefix-title',
      title: 'alpha beta',
      script: null,
    });
    const containsTitle = row({
      id: 'contains-title',
      title: 'zero alpha beta',
      script: null,
    });
    const scriptExact = row({
      id: 'script-exact',
      title: 'other',
      script: 'alpha',
    });
    const scriptPrefix = row({
      id: 'script-prefix',
      title: 'other',
      script: 'alpha beta.',
    });
    const scriptContains = row({
      id: 'script-contains',
      title: 'other',
      script: 'zero alpha beta.',
    });

    const result = rankEpisodeSearchResults(
      [
        containsTitle,
        scriptContains,
        prefixTitle,
        scriptPrefix,
        exactTitle,
        scriptExact,
      ],
      'alpha',
      20,
    );

    expect(result.slice(0, 3).map((item) => item.row.id)).toEqual([
      'exact-title',
      'prefix-title',
      'contains-title',
    ]);
    expect(
      new Set(
        result
          .filter((item) => item.matchSource === 'script')
          .map((item) => item.row.id),
      ),
    ).toEqual(new Set(['script-exact', 'script-prefix', 'script-contains']));
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

  it('covers short and long fuzzy thresholds for title and script', () => {
    const shortRows = [
      row({ id: 'short-title', title: 'ab xx bc xx cd', script: null }),
      row({
        id: 'short-script',
        title: 'unrelated',
        script: 'ab xx bc xx cd.',
      }),
    ];
    const longRows = [
      row({ id: 'long-title', title: 'abcde zz fghi', script: null }),
      row({ id: 'long-script', title: 'unrelated', script: 'abcdefg x ghi.' }),
    ];

    expect(rankEpisodeSearchResults(shortRows, 'abcd', 20)).not.toEqual([]);
    expect(rankEpisodeSearchResults(longRows, 'abcdefghi', 20)).not.toEqual([]);
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

  it('uses null title snippets when a title match has no script', () => {
    const result = rankEpisodeSearchResults(
      [row({ title: 'Bitcoin custody', script: null })],
      'bitcoin',
      20,
    );
    expect(result[0]?.snippet).toBeNull();
  });

  it('handles an empty normalized title by matching the script instead', () => {
    const result = rankEpisodeSearchResults(
      [row({ title: '', script: 'Liquidity conditions changed.' })],
      'liquidity',
      20,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.matchSource).toBe('script');
  });

  it('keeps the first equally strong fuzzy script segment instead of replacing it', () => {
    const result = rankEpisodeSearchResults(
      [
        row({
          title: 'Weekly notes',
          script: 'Liquiditx conditions changed. Liquiditx markets reacted.',
        }),
      ],
      'liquidity',
      20,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.matchSource).toBe('script');
    expect(result[0]?.snippet).toContain('Liquiditx conditions changed');
  });

  it('filters unrelated rows and handles null scripts', () => {
    const result = rankEpisodeSearchResults(
      [row({ title: 'Bitcoin custody', script: null })],
      'monetary policy',
      20,
    );

    expect(result).toEqual([]);
  });

  it('chooses the strongest fuzzy script segment and can let script beat a weaker title match', () => {
    const result = rankEpisodeSearchResults(
      [
        row({
          id: 'script-wins',
          title: 'liquidityz',
          script: 'weak opening liquidityx. much closer liquidityy liquidity.',
        }),
      ],
      'liquidity',
      20,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.snippet).toContain('liquidity');
  });

  it('orders equal scores by date and then id', () => {
    const old = row({
      id: 'a',
      title: 'same title',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const newerA = row({
      id: 'a-new',
      title: 'same title',
      created_at: '2026-06-01T00:00:00.000Z',
    });
    const newerZ = row({
      id: 'z-new',
      title: 'same title',
      created_at: '2026-06-01T00:00:00.000Z',
    });
    expect(
      rankEpisodeSearchResults([old, newerA, newerZ], 'same title', 20).map(
        (item) => item.row.id,
      ),
    ).toEqual(['z-new', 'a-new', 'a']);
  });

  it('uses ngram fallback when query spans across script segments', () => {
    const rows = [
      row({
        id: 'ngram',
        title: 'Weekly notes',
        script:
          'The Federal Reserve met today. Rates were unchanged. The committee discussed inflation.',
      }),
    ];

    const result = rankEpisodeSearchResults(rows, 'today rates', 20);
    expect(result).toHaveLength(1);
    expect(result[0]?.matchSource).toBe('script');
    expect(result[0]?.snippet).toBeTruthy();
  });

  it('chooses a later segment when it has stronger ngram coverage for a cross-boundary match', () => {
    const result = rankEpisodeSearchResults(
      [
        row({
          title: 'Weekly notes',
          script: 'The marker is x. Abcdef conditions changed materially.',
        }),
      ],
      'x abcdef',
      20,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.matchSource).toBe('script');
    expect(result[0]?.snippet).toContain('Abcdef conditions');
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

  it('does not cache an in-flight corpus invalidated before it resolves', async () => {
    let resolveFirst:
      | ((value: { rows: EpisodeListRow[]; nextCursor: null }) => void)
      | undefined;
    const loadPage = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ rows: EpisodeListRow[]; nextCursor: null }>(
            (resolve) => {
              resolveFirst = resolve;
            },
          ),
      )
      .mockResolvedValue({
        rows: [row({ id: 'fresh', title: 'Liquidity fresh' })],
        nextCursor: null,
      });
    const service = createEpisodeSearchService({ loadPage, now: () => 1_000 });

    const staleSearch = service.search('liquidity', 'en', 20);
    await vi.waitFor(() => expect(loadPage).toHaveBeenCalledOnce());
    service.invalidate();
    const freshSearch = service.search('liquidity', 'en', 20);
    resolveFirst?.({
      rows: [row({ id: 'stale', title: 'Liquidity stale' })],
      nextCursor: null,
    });

    expect((await staleSearch)[0]?.episode.id).toBe('stale');
    expect((await freshSearch)[0]?.episode.id).toBe('fresh');
    await service.search('liquidity', 'en', 20);
    expect(loadPage).toHaveBeenCalledTimes(2);
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

describe('module-level searchEpisodes', () => {
  it('delegates to the default search service', async () => {
    const result = await searchEpisodes('liquidity', 'en', 10);
    expect(result).toEqual([]);
  });

  it('invalidateEpisodeSearchCache does not throw', () => {
    expect(() => invalidateEpisodeSearchCache()).not.toThrow();
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
    like_count: overrides.like_count ?? 0,
    language_classrooms: overrides.language_classrooms ?? [],
  };
}

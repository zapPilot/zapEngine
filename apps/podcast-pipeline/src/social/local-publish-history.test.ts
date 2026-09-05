import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  returns: vi.fn(),
  titles: vi.fn(),
  state: vi.fn(),
}));
vi.mock('../services/supabase-client.js', () => ({
  getPipelineSupabase: () => {
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      order: () => query,
      limit: () => query,
      returns: mocks.returns,
    };
    return { from: () => query };
  },
  throwSupabaseError: (error: unknown) => {
    throw error;
  },
}));
vi.mock('./daemon-store.js', () => ({
  listSocialEpisodeLocalizationTitles: mocks.titles,
}));
vi.mock('./state.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state.js')>()),
  readPublishState: mocks.state,
}));
import { reportLocalPublicationHistory } from './local-publish-history.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.titles.mockResolvedValue([
    { episode_id: 'episode', language_code: 'zh-Hant', title: 'KiiChain' },
  ]);
  mocks.state.mockResolvedValue({
    episode: {
      zh: {
        youtube: {
          published: true,
          publishedAt: '2026-08-22T05:38:00Z',
          url: 'https://www.youtube.com/watch?v=old',
        },
      },
    },
  });
});

it('shows completed history and matching links without inventing telemetry', async () => {
  mocks.returns.mockResolvedValue({
    data: [
      {
        episode_id: 'episode',
        platform: 'youtube',
        language_code: 'zh-Hant',
        completed_at: '2026-08-22T05:38:00+00:00',
      },
      {
        episode_id: 'episode',
        platform: 'threads',
        language_code: 'zh-Hant',
        completed_at: '2026-08-22T05:39:00Z',
      },
      {
        episode_id: 'episode',
        platform: 'youtube',
        language_code: 'ja',
        completed_at: '2026-08-22T05:40:00Z',
      },
    ],
    error: null,
  });
  const log = vi.fn();
  await reportLocalPublicationHistory(log);
  expect(
    log.mock.calls.filter(([line]) => line.includes('history · “KiiChain”')),
  ).toHaveLength(1);
  expect(log.mock.calls[1]?.[0]).toContain(
    'https://www.youtube.com/watch?v=old',
  );
  expect(log.mock.calls[2]?.[0]).toContain('no verified link');
  expect(log.mock.calls[3]?.[0]).toContain('no verified link');
  expect(log.mock.calls[0]?.[0]).toContain('historical telemetry unavailable');
});

it('does not prevent startup when history is unavailable', async () => {
  mocks.returns.mockResolvedValue({ data: null, error: new Error('offline') });
  const log = vi.fn();
  await expect(reportLocalPublicationHistory(log)).resolves.toBeUndefined();
  expect(log).toHaveBeenCalledWith(
    expect.stringContaining('history unavailable: offline'),
  );
});

it('keeps every lane under its own article when episodes interleave', async () => {
  mocks.titles.mockResolvedValue([
    { episode_id: 'episode', language_code: 'zh-Hant', title: 'KiiChain' },
    { episode_id: 'other', language_code: 'zh-Hant', title: 'Monad' },
  ]);
  mocks.returns.mockResolvedValue({
    data: [
      {
        episode_id: 'episode',
        platform: 'youtube',
        language_code: 'zh-Hant',
        completed_at: '2026-08-22T05:38:00+00:00',
      },
      {
        episode_id: 'other',
        platform: 'youtube',
        language_code: 'zh-Hant',
        completed_at: '2026-08-21T05:38:00Z',
      },
      {
        episode_id: 'episode',
        platform: 'threads',
        language_code: 'zh-Hant',
        completed_at: '2026-08-20T05:38:00Z',
      },
    ],
    error: null,
  });
  const log = vi.fn();
  await reportLocalPublicationHistory(log);
  expect(log.mock.calls.map(([line]) => line)).toEqual([
    expect.stringContaining('history · “KiiChain”'),
    expect.stringContaining('youtube/zh-Hant · 2026-08-22T05:38:00+00:00'),
    expect.stringContaining('threads/zh-Hant · 2026-08-20T05:38:00Z'),
    expect.stringContaining('history · “Monad”'),
    expect.stringContaining('youtube/zh-Hant · 2026-08-21T05:38:00Z'),
  ]);
});

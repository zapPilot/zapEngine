import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TelegramIngestQueue } from './telegram-ingest-queue.js';

interface QueryResult {
  data: unknown;
  error: unknown;
}

const supabase = vi.hoisted(() => {
  const results = new Map<string, QueryResult[]>();
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    const result = results.get(table)?.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'limit', 'in']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      });
    }
    builder['maybeSingle'] = vi.fn(() => Promise.resolve(result));
    builder['then'] = (
      resolve: (value: QueryResult) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  return { results, calls, from };
});

const videoJobs = vi.hoisted(() => ({
  retryEpisodeVideoGeneration: vi.fn(),
}));

vi.mock('./supabase-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase-client.js')>()),
  getPipelineSupabase: () => ({ from: supabase.from }),
}));

vi.mock('./video-jobs.js', () => videoJobs);

import {
  handleTelegramRetryCommand,
  handleTelegramRetryVideoCallback,
  handleTelegramStatusCommand,
  isTelegramRetryMigrationMissing,
  resolveTelegramEpisodeTarget,
  telegramCommandErrorText,
} from './telegram-commands.js';

const EPISODE_ID = '00000000-0000-4000-8000-000000000001';
const SOURCE_URL = 'https://example.com/article';
const EPISODE_ROW = { id: EPISODE_ID, source_url: SOURCE_URL };

function localization(
  languageCode: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: `loc-${languageCode}`,
    language_code: languageCode,
    status: 'completed',
    script: 'Script',
    hls_url: 'https://cdn.example.com/audio.m3u8',
    classroom_hls_url:
      languageCode === 'zh-Hant'
        ? 'https://cdn.example.com/classroom.m3u8'
        : null,
    ...overrides,
  };
}

function readyLocalizations(): Record<string, unknown>[] {
  return [localization('zh-Hant'), localization('ja'), localization('en')];
}

function setResults(entries: Record<string, QueryResult[]>): void {
  for (const [table, queue] of Object.entries(entries)) {
    supabase.results.set(table, queue);
  }
}

function ok(data: unknown): QueryResult {
  return { data, error: null };
}

function makeQueue(): TelegramIngestQueue {
  return {
    enqueue: vi.fn(),
    scheduleMessage: vi.fn(),
    recoverNow: vi.fn(),
  };
}

beforeEach(() => {
  supabase.results.clear();
  supabase.calls.length = 0;
  supabase.from.mockClear();
  videoJobs.retryEpisodeVideoGeneration.mockReset();
});

describe('resolveTelegramEpisodeTarget', () => {
  it('looks up an episode by id', async () => {
    setResults({ episodes: [ok(EPISODE_ROW)] });

    await expect(
      resolveTelegramEpisodeTarget(`  ${EPISODE_ID} `),
    ).resolves.toEqual({ episodeId: EPISODE_ID, sourceUrl: SOURCE_URL });
    expect(supabase.calls).toContainEqual({
      table: 'episodes',
      method: 'eq',
      args: ['id', EPISODE_ID],
    });
  });

  it('returns null when the id is unknown', async () => {
    setResults({ episodes: [ok(null)] });
    await expect(resolveTelegramEpisodeTarget(EPISODE_ID)).resolves.toBeNull();
  });

  it('looks up the newest episode by normalized source URL', async () => {
    setResults({ episodes: [ok([EPISODE_ROW])] });

    await expect(
      resolveTelegramEpisodeTarget('https://example.com/article'),
    ).resolves.toEqual({ episodeId: EPISODE_ID, sourceUrl: SOURCE_URL });
    expect(supabase.calls).toContainEqual({
      table: 'episodes',
      method: 'eq',
      args: ['source_url', SOURCE_URL],
    });
    expect(supabase.calls).toContainEqual({
      table: 'episodes',
      method: 'order',
      args: ['created_at', { ascending: false }],
    });
    expect(supabase.calls).toContainEqual({
      table: 'episodes',
      method: 'limit',
      args: [1],
    });
  });

  it('returns null for URLs with no episode or non-array data', async () => {
    setResults({ episodes: [ok([]), ok(null)] });
    await expect(resolveTelegramEpisodeTarget(SOURCE_URL)).resolves.toBeNull();
    await expect(resolveTelegramEpisodeTarget(SOURCE_URL)).resolves.toBeNull();
  });

  it('returns null without querying for input that is neither id nor URL', async () => {
    await expect(resolveTelegramEpisodeTarget('not a url')).resolves.toBeNull();
    await expect(
      resolveTelegramEpisodeTarget('ftp://example.com/file'),
    ).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('throws on supabase errors for both lookup paths', async () => {
    setResults({
      episodes: [
        { data: null, error: { message: 'id lookup failed' } },
        { data: null, error: { message: 'url lookup failed' } },
      ],
    });
    await expect(resolveTelegramEpisodeTarget(EPISODE_ID)).rejects.toThrow(
      'id lookup failed',
    );
    await expect(resolveTelegramEpisodeTarget(SOURCE_URL)).rejects.toThrow(
      'url lookup failed',
    );
  });
});

describe('handleTelegramRetryCommand', () => {
  it('reports an unknown episode', async () => {
    setResults({ episodes: [ok(null)] });
    const queue = makeQueue();

    await expect(
      handleTelegramRetryCommand({ chatId: 1, target: EPISODE_ID, queue }),
    ).resolves.toBe('找不到這集 podcast，請確認 URL 或 episode id。');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('re-enqueues the ingest when audio is not ready for every language', async () => {
    setResults({
      episodes: [ok(EPISODE_ROW)],
      episode_localizations: [
        ok([localization('zh-Hant'), localization('ja', { hls_url: '' })]),
      ],
    });
    const queue = makeQueue();

    await expect(
      handleTelegramRetryCommand({ chatId: 42, target: EPISODE_ID, queue }),
    ).resolves.toBe('已從最後完成的音頻 checkpoint 重新排程。');
    expect(queue.enqueue).toHaveBeenCalledWith(42, SOURCE_URL, 'zh-Hant');
    expect(videoJobs.retryEpisodeVideoGeneration).not.toHaveBeenCalled();
    expect(supabase.calls).toContainEqual({
      table: 'episode_localizations',
      method: 'in',
      args: ['language_code', ['zh-Hant', 'ja', 'en']],
    });
  });

  it('treats a canonical localization without classroom audio as not ready', async () => {
    setResults({
      episodes: [ok(EPISODE_ROW)],
      episode_localizations: [
        ok([
          localization('zh-Hant', { classroom_hls_url: '  ' }),
          localization('ja'),
          localization('en'),
        ]),
      ],
    });
    const queue = makeQueue();

    await handleTelegramRetryCommand({ chatId: 1, target: EPISODE_ID, queue });
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('throws when localization statuses cannot be loaded', async () => {
    setResults({
      episodes: [ok(EPISODE_ROW)],
      episode_localizations: [
        { data: null, error: { message: 'localizations failed' } },
      ],
    });
    await expect(
      handleTelegramRetryCommand({
        chatId: 1,
        target: EPISODE_ID,
        queue: makeQueue(),
      }),
    ).rejects.toThrow('localizations failed');
  });

  it.each([
    ['queued', '已重新排程影片；既有完成的 visual checkpoint 會保留。'],
    ['processing', '這集影片目前仍在處理中，沒有清除 live lease。'],
    ['completed', '這集三語影片已完成。'],
    ['missing', '這集還沒有 visual job；請重新貼原始 URL 建立影片工作。'],
    ['abandoned', '這集影片已由操作者結案，不再重排；要重開請清除結案標記。'],
    ['prerequisites', '影片重試的三語音頻前置條件尚未完成。'],
    ['unavailable', '資料庫尚未升級到影片重試 migration。'],
  ])('maps the %s video retry outcome', async (outcome, text) => {
    setResults({
      episodes: [ok(EPISODE_ROW)],
      episode_localizations: [ok(readyLocalizations())],
    });
    videoJobs.retryEpisodeVideoGeneration.mockResolvedValueOnce(outcome);
    const queue = makeQueue();

    await expect(
      handleTelegramRetryCommand({ chatId: 1, target: EPISODE_ID, queue }),
    ).resolves.toBe(text);
    expect(videoJobs.retryEpisodeVideoGeneration).toHaveBeenCalledWith(
      EPISODE_ID,
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});

describe('handleTelegramRetryVideoCallback', () => {
  it.each([
    ['queued', '影片已重新排程'],
    ['processing', '影片仍在處理中'],
    ['completed', '影片已完成'],
    ['unavailable', '資料庫尚未升級'],
    ['missing', '找不到 visual job'],
    ['abandoned', '影片已結案，不再重排'],
    ['prerequisites', '音頻前置條件未完成'],
  ])('maps the %s outcome', async (outcome, text) => {
    videoJobs.retryEpisodeVideoGeneration.mockResolvedValueOnce(outcome);
    await expect(handleTelegramRetryVideoCallback(EPISODE_ID)).resolves.toBe(
      text,
    );
    expect(videoJobs.retryEpisodeVideoGeneration).toHaveBeenCalledWith(
      EPISODE_ID,
    );
  });
});

describe('handleTelegramStatusCommand', () => {
  it('returns usage for a malformed id without querying', async () => {
    await expect(handleTelegramStatusCommand('nope')).resolves.toBe(
      '用法：/status <episodeId>',
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('reports an unknown episode', async () => {
    setResults({ episodes: [ok(null)] });
    await expect(handleTelegramStatusCommand(EPISODE_ID)).resolves.toBe(
      '找不到這集 podcast。',
    );
  });

  it('marks everything as missing or not scheduled when nothing exists yet', async () => {
    setResults({
      episodes: [ok(EPISODE_ROW)],
      episode_localizations: [ok([])],
      episode_video_visuals: [ok(null)],
      episode_videos: [ok(null)],
    });

    await expect(handleTelegramStatusCommand(EPISODE_ID)).resolves.toBe(
      [
        `Episode ${EPISODE_ID}`,
        'zh-Hant: script — · audio — · render not scheduled',
        'ja: script — · audio — · render not scheduled',
        'en: script — · audio — · render not scheduled',
        'visual: not scheduled',
      ].join('\n'),
    );
  });

  it('formats progress, first error line, stale version and completed renders', async () => {
    setResults({
      episodes: [ok(EPISODE_ROW)],
      episode_localizations: [
        ok([
          localization('zh-Hant'),
          localization('ja', { status: 'processing', hls_url: null }),
          localization('en', { script: '   ' }),
        ]),
      ],
      episode_video_visuals: [
        ok({
          status: 'failed',
          progress_stage: 'plan-assets',
          progress_percent: 40,
          last_error: `${'e'.repeat(130)}\nsecond line`,
          visual_version: 'podcast-image-visual-plan.v1',
        }),
      ],
      episode_videos: [
        ok([
          {
            episode_localization_id: 'loc-zh-Hant',
            status: 'completed',
            progress_stage: 'render',
            progress_percent: 100,
            last_error: null,
            visual_version: EPISODE_VIDEO_VISUAL_VERSION,
          },
          {
            episode_localization_id: 'loc-ja',
            status: 'processing',
            progress_stage: null,
            progress_percent: 12.5,
            last_error: '   ',
            visual_version: EPISODE_VIDEO_VISUAL_VERSION,
          },
          {
            episode_localization_id: 'loc-en',
            status: 'queued',
            progress_stage: 'encode',
            progress_percent: null,
            last_error: 'boom\r\nmore',
            visual_version: EPISODE_VIDEO_VISUAL_VERSION,
          },
          {
            episode_localization_id: 'loc-unknown',
            status: 'queued',
            progress_stage: null,
            progress_percent: null,
            last_error: null,
            visual_version: EPISODE_VIDEO_VISUAL_VERSION,
          },
        ]),
      ],
    });

    await expect(handleTelegramStatusCommand(EPISODE_ID)).resolves.toBe(
      [
        `Episode ${EPISODE_ID}`,
        'zh-Hant: script ✓ · audio ✓ · render completed',
        'ja: script ✓ · audio — · render processing 12.5%',
        'en: script — · audio — · render queued encode · boom',
        `visual: failed plan-assets 40% · ${'e'.repeat(120)} · podcast-image-visual-plan.v1 · STALE VERSION`,
      ].join('\n'),
    );
  });

  it('does not flag a completed visual on an old version as stale', async () => {
    setResults({
      episodes: [ok(EPISODE_ROW)],
      episode_localizations: [ok(readyLocalizations())],
      episode_video_visuals: [
        ok({
          status: 'completed',
          progress_stage: 'upload',
          progress_percent: 100,
          last_error: null,
          visual_version: 'podcast-image-visual-plan.v1',
        }),
      ],
      episode_videos: [ok([])],
    });

    const text = await handleTelegramStatusCommand(EPISODE_ID);
    expect(text.split('\n').at(-1)).toBe(
      'visual: completed · podcast-image-visual-plan.v1',
    );
  });

  it('omits the version suffix when the visual row has none', async () => {
    setResults({
      episodes: [ok(EPISODE_ROW)],
      episode_localizations: [ok(readyLocalizations())],
      episode_video_visuals: [
        ok({
          status: 'queued',
          progress_stage: null,
          progress_percent: null,
          last_error: null,
          visual_version: null,
        }),
      ],
      episode_videos: [ok([])],
    });

    const text = await handleTelegramStatusCommand(EPISODE_ID);
    expect(text.split('\n').at(-1)).toBe('visual: queued · STALE VERSION');
  });

  it('throws when the visual or render query fails', async () => {
    setResults({
      episodes: [ok(EPISODE_ROW)],
      episode_localizations: [ok([])],
      episode_video_visuals: [
        { data: null, error: { message: 'visual failed' } },
      ],
      episode_videos: [ok([])],
    });
    await expect(handleTelegramStatusCommand(EPISODE_ID)).rejects.toThrow(
      'visual failed',
    );

    setResults({
      episodes: [ok(EPISODE_ROW)],
      episode_localizations: [ok([])],
      episode_video_visuals: [ok(null)],
      episode_videos: [{ data: null, error: { message: 'renders failed' } }],
    });
    await expect(handleTelegramStatusCommand(EPISODE_ID)).rejects.toThrow(
      'renders failed',
    );
  });
});

describe('isTelegramRetryMigrationMissing', () => {
  it('recognises either retry RPC being absent', () => {
    expect(isTelegramRetryMigrationMissing({ code: 'PGRST202' })).toBe(true);
    expect(
      isTelegramRetryMigrationMissing({
        message:
          'Could not find the function restart_podcast_ingest in the schema cache',
      }),
    ).toBe(true);
    expect(
      isTelegramRetryMigrationMissing({
        message:
          'Could not find the function retry_episode_video_generation in the schema cache',
      }),
    ).toBe(true);
    expect(
      isTelegramRetryMigrationMissing({ message: 'schema cache other_fn' }),
    ).toBe(false);
    expect(isTelegramRetryMigrationMissing(new Error('boom'))).toBe(false);
    expect(isTelegramRetryMigrationMissing(null)).toBe(false);
  });
});

describe('telegramCommandErrorText', () => {
  it('names a missing migration', () => {
    expect(telegramCommandErrorText({ code: '42883' })).toBe(
      '資料庫尚未升級。',
    );
  });

  it('keeps only the first line of the message, capped at 160 characters', () => {
    expect(
      telegramCommandErrorText(new Error(`${'m'.repeat(200)}\nsecond`)),
    ).toBe(`操作失敗：${'m'.repeat(160)}`);
    expect(telegramCommandErrorText('plain string')).toBe(
      '操作失敗：plain string',
    );
  });
});

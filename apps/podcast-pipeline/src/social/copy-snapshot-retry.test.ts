import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  generate: vi.fn(),
  episode: vi.fn(),
  packaging: vi.fn(),
  transport: vi.fn(),
  insertPost: vi.fn(),
}));
vi.mock('../services/supabase-client.js', async (original) => ({
  ...(await original<typeof import('../services/supabase-client.js')>()),
  getPipelineSupabase: () => ({ from: mocks.from }),
}));
vi.mock('./copy.js', () => ({ generateSocialCopy: mocks.generate }));
vi.mock('./episode.js', () => ({ getSocialEpisode: mocks.episode }));
vi.mock('./packaging-experiments.js', () => ({
  resolvePackagingAssignments: mocks.packaging,
}));
vi.mock('./prepare-batch-assets.js', () => ({
  prepareSocialBatchAssets: (input: { existing: unknown }) => input.existing,
}));
vi.mock('./publishers.js', () => ({
  createSocialPublishJobs: () => [
    { platform: 'threads', publish: mocks.transport },
  ],
}));
vi.mock('../services/db.js', () => ({ insertSocialPost: mocks.insertPost }));
vi.mock('./state.js', () => ({
  readPublishState: vi.fn().mockResolvedValue({}),
  getPublishedPlatform: vi.fn(),
  markPlatformPublished: vi.fn(),
}));

import {
  loadSocialCopySnapshot,
  saveSocialCopySnapshot,
} from './copy-snapshot-store.js';
import { prepareSocialBatchCopy, publishSocialBatch } from './publish-batch.js';
import type { GeneratedSocialCopy, SocialEpisode } from './types.js';

const copy: GeneratedSocialCopy = {
  topic: 'macro',
  threads: { hookType: 'question', text: '原本文案？' },
  rednote: { hookType: 'question', body: '正文', hashtags: ['市場'] },
};
const episode: SocialEpisode = {
  id: 'episode-1',
  languageCode: 'zh-Hant',
  title: 'Canonical AI 標題',
  summary: '摘要',
  transcript: '逐字稿',
  publishedAt: '2026-09-29T00:00:00Z',
  episodeUrl: 'https://example.com/e/1',
  videoUrl: 'https://example.com/video.mp4',
  videoThumbnailUrl: 'https://example.com/poster.jpg',
  videoDurationSeconds: 120,
};
const input = {
  episodeId: episode.id,
  languageCode: 'zh-Hant' as const,
  platforms: ['threads', 'rednote'] as const,
};
const durable = {
  snapshot: { generated: copy, published: copy, model: 'original-model' },
  packagingByPlatform: {},
};
let rows: Map<string, unknown>;
let events: string[];
let readError: Error | null;
let writeError: Error | null;
let hideRows: boolean;

beforeEach(() => {
  vi.clearAllMocks();
  rows = new Map();
  events = [];
  readError = null;
  writeError = null;
  hideRows = false;
  mocks.episode.mockResolvedValue(episode);
  mocks.packaging.mockResolvedValue({});
  mocks.generate.mockImplementation(() => {
    events.push('generate');
    return { copy, model: 'original-model' };
  });
  mocks.transport.mockImplementation(() => {
    events.push('transport');
    throw new Error('prepare_video failed');
  });
  mocks.from.mockImplementation((table: string) => {
    expect(table).toBe('social_copy_snapshots');
    const filters: Record<string, string> = {};
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((key: string, value: string) => {
        filters[key] = value;
        return query;
      }),
      maybeSingle: async () => ({
        data: hideRows
          ? null
          : (rows.get(`${filters['episode_id']}:${filters['language_code']}`) ??
            null),
        error: readError,
      }),
      upsert: async (row: Record<string, unknown>, options: unknown) => {
        expect(options).toEqual({
          onConflict: 'episode_id,language_code',
          ignoreDuplicates: true,
        });
        events.push('persist');
        const key = `${row['episode_id']}:${row['language_code']}`;
        if (!writeError && !rows.has(key)) rows.set(key, structuredClone(row));
        return { error: writeError };
      },
    };
    return query;
  });
});

async function release() {
  const prepared = await prepareSocialBatchCopy(input);
  expect(prepared.episode.title).toBe(episode.title);
  return publishSocialBatch({
    ...input,
    platforms: input.platforms.map((platform) => ({ platform })),
    ...prepared,
    copySnapshot: prepared.snapshot,
  });
}

describe('durable release copy', () => {
  it('commits before transport and reuses the same language snapshot after failure without fake posts', async () => {
    await expect(release()).rejects.toThrow('prepare_video failed');
    expect(events).toEqual(['generate', 'persist', 'transport']);
    await expect(release()).rejects.toThrow('prepare_video failed');
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(rows.size).toBe(1);
    expect(mocks.insertPost).not.toHaveBeenCalled();
    const retry = await prepareSocialBatchCopy({
      ...input,
      platforms: ['rednote'],
      strategyGuidanceByPlatform: { rednote: 'new guidance' },
    });
    expect(retry.snapshot).toEqual(durable.snapshot);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it('persists language snapshots independently', async () => {
    await prepareSocialBatchCopy(input);
    await prepareSocialBatchCopy({ ...input, languageCode: 'ja' });
    expect(rows.size).toBe(2);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
  });

  it('fails closed on read and write errors', async () => {
    readError = new Error('read unavailable');
    await expect(release()).rejects.toThrow('read unavailable');
    expect(mocks.generate).not.toHaveBeenCalled();
    readError = null;
    writeError = new Error('write unavailable');
    await expect(release()).rejects.toThrow('write unavailable');
    expect(mocks.transport).not.toHaveBeenCalled();
    expect(mocks.insertPost).not.toHaveBeenCalled();
  });

  it('keeps the first committed copy and packaging identity', async () => {
    const first = {
      ...durable,
      packagingByPlatform: {
        threads: { key: 'old', variant: 'A', instruction: 'frozen' },
      },
    };
    await saveSocialCopySnapshot(episode.id, 'zh-Hant', first);
    const saved = await saveSocialCopySnapshot(episode.id, 'zh-Hant', {
      ...durable,
      snapshot: { ...durable.snapshot, model: 'new-model' },
    });
    expect(saved).toEqual(first);
    expect(await prepareSocialBatchCopy(input)).toEqual({ episode, ...first });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.packaging).not.toHaveBeenCalled();
  });

  it('does not regenerate an existing snapshot missing a requested block', async () => {
    await saveSocialCopySnapshot(episode.id, 'zh-Hant', durable);
    await expect(
      prepareSocialBatchCopy({ ...input, platforms: ['x'] }),
    ).rejects.toThrow('refusing to regenerate');
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('requires read-back confirmation of persistence', async () => {
    hideRows = true;
    await expect(
      saveSocialCopySnapshot(episode.id, 'zh-Hant', durable),
    ).rejects.toThrow('missing after persistence');
    expect(await loadSocialCopySnapshot('missing', 'en')).toBeNull();
  });
});

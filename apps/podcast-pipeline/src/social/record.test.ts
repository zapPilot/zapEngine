import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({ insertSocialPost: vi.fn() }));

vi.mock('../services/db.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/db.js')>()),
  insertSocialPost: dbMocks.insertSocialPost,
}));

import { toSocialPostInsertPayload } from '../services/db.js';
import type { NewSocialPost, SocialPostRow } from '../types.js';
import {
  buildContentFeatures,
  buildSocialPostRecord,
  createSocialPostPersister,
  type SocialCopySnapshot,
} from './record.js';
import type {
  GeneratedSocialCopy,
  PublishResult,
  SocialEpisode,
} from './types.js';

const generated: GeneratedSocialCopy = {
  topic: 'eth',
  x: { hookType: 'surprising_number', text: 'AI 產生的短文案' },
  threads: { hookType: 'explainer', text: 'AI 產生的 Threads 文案' },
  rednote: {
    hookType: 'contrarian',
    title: 'AI 產生標題',
    body: 'AI 產生的正文',
    hashtags: ['以太坊', '質押', '投資'],
  },
  youtube: { hookType: 'explainer', title: 'AI 產生的 YouTube 標題' },
};
const published: GeneratedSocialCopy = {
  topic: 'macro',
  x: { hookType: 'question', text: '編輯後的短文案？２０２６' },
  threads: { hookType: 'question', text: '編輯後的 Threads 文案？２０２６' },
  rednote: {
    hookType: 'question',
    title: '利率真的轉向？',
    body: '編輯後的正文含數字２',
    hashtags: ['總經', '利率', '市場事件'],
  },
  youtube: { hookType: 'question', title: '編輯後的 YouTube 標題？' },
};
beforeEach(() => {
  vi.clearAllMocks();
});

const episode: Pick<SocialEpisode, 'title' | 'summary' | 'description'> = {
  title: '市場更新',
  summary: '本集摘要。',
  description: '完整說明',
};

const snapshot: SocialCopySnapshot = {
  generated,
  published,
  model: 'openrouter/model-v1',
};

function result(input?: Partial<PublishResult>): PublishResult {
  return {
    status: 'published',
    publishedAt: '2026-08-15T01:02:03.000Z',
    ...input,
  };
}

describe('buildContentFeatures', () => {
  it('detects questions and full-width numbers deterministically', () => {
    expect(
      buildContentFeatures({
        title: null,
        body: '利率２％會轉向？',
        hashtags: ['市場'],
      }),
    ).toEqual({
      containsQuestion: true,
      containsNumber: true,
      titleChars: null,
      bodyChars: 8,
      hashtagCount: 1,
    });
  });
});

describe('buildSocialPostRecord', () => {
  it('computes the actual teaser duration for X by default', () => {
    expect(
      buildSocialPostRecord({
        episodeId: 'episode-1',
        platform: 'x',
        result: result({ url: 'https://x.com/zap/status/123', postId: '123' }),
        snapshot,
        episode,
        videoDurationSeconds: 321,
      }),
    ).toMatchObject({
      platform: 'x',
      postUrl: 'https://x.com/zap/status/123',
      platformPostId: '123',
      videoDurationSec: 132.8,
    });
  });

  it('accepts an explicit X duration for recovery/backfill callers', () => {
    expect(
      buildSocialPostRecord({
        episodeId: 'episode-1',
        platform: 'x',
        result: result(),
        snapshot,
        episode,
        videoDurationSeconds: 321,
        xVideoDurationSeconds: 133,
      }).videoDurationSec,
    ).toBe(133);
  });

  it('records the platform-safe teaser duration for Threads', () => {
    expect(
      buildSocialPostRecord({
        episodeId: 'episode-1',
        platform: 'threads',
        result: result({ postId: 'thread-1' }),
        snapshot,
        episode,
        videoDurationSeconds: 321,
      }),
    ).toMatchObject({
      platform: 'threads',
      platformPostId: 'thread-1',
      videoDurationSec: 132.8,
      generatedTitle: null,
      publishedTitle: null,
    });
  });

  it('projects YouTube metadata assembled from the episode and full video duration', () => {
    expect(
      buildSocialPostRecord({
        episodeId: 'episode-1',
        platform: 'youtube',
        result: result({
          url: 'https://www.youtube.com/watch?v=video-1',
          postId: 'video-1',
        }),
        snapshot,
        episode,
        videoDurationSeconds: 321,
      }),
    ).toMatchObject({
      platform: 'youtube',
      postUrl: 'https://www.youtube.com/watch?v=video-1',
      platformPostId: 'video-1',
      generatedTitle: 'AI 產生的 YouTube 標題',
      publishedTitle: '編輯後的 YouTube 標題？',
      generatedBody:
        '完整說明\n\n更多市場洞察與工具：https://www.zap-pilot.org',
      publishedBody:
        '完整說明\n\n更多市場洞察與工具：https://www.zap-pilot.org',
      hashtags: [],
      videoDurationSec: 321,
    });
  });

  it('projects Rednote titles, hashtags, and full video duration', () => {
    expect(
      buildSocialPostRecord({
        episodeId: 'episode-1',
        platform: 'rednote',
        result: result(),
        snapshot,
        episode,
        videoDurationSeconds: 321,
      }),
    ).toMatchObject({
      platform: 'rednote',
      generatedTitle: 'AI 產生標題',
      publishedTitle: '利率真的轉向？',
      generatedBody: 'AI 產生的正文',
      publishedBody: '編輯後的正文含數字２',
      hashtags: ['總經', '利率', '市場事件'],
      videoDurationSec: 321,
    });
  });

  // A generated hashtag with no matching Rednote topic is skipped rather than
  // typed in as literal text, so the note carries fewer topics than the copy
  // asked for. Recording the requested set would credit the learner's
  // preferred/avoid pools with a tag that was never on the note.
  it('records the hashtags the platform actually accepted', () => {
    expect(
      buildSocialPostRecord({
        episodeId: 'episode-1',
        platform: 'rednote',
        result: result({ hashtags: ['總經', '利率'] }),
        snapshot,
        episode,
        videoDurationSeconds: 321,
      }),
    ).toMatchObject({
      hashtags: ['總經', '利率'],
      contentFeatures: expect.objectContaining({ hashtagCount: 2 }),
    });
  });

  // Rednote's note carries no prose body; the publisher reports `body: ''`
  // and telemetry has to store that instead of the composed (never-sent)
  // draft. `generated_body` is untouched, so the two remain comparable.
  it('honors an empty published body reported by the platform', () => {
    expect(
      buildSocialPostRecord({
        episodeId: 'episode-1',
        platform: 'rednote',
        result: result({ body: '' }),
        snapshot,
        episode,
        videoDurationSeconds: 321,
      }),
    ).toMatchObject({
      publishedBody: '',
      generatedBody: 'AI 產生的正文',
      contentFeatures: expect.objectContaining({ bodyChars: 0 }),
    });
  });
});

describe('createSocialPostPersister', () => {
  it('uses the default database writer and error logger when not injected', async () => {
    dbMocks.insertSocialPost.mockResolvedValue({ id: 'social-post-default' });
    const persist = createSocialPostPersister({
      episodeId: 'episode-1',
      snapshot,
      episode,
      videoDurationSeconds: 321,
      xVideoDurationSeconds: 130,
    });

    await persist({ platform: 'x', result: result() });
    expect(dbMocks.insertSocialPost).toHaveBeenCalledWith(
      expect.objectContaining({ videoDurationSec: 130 }),
    );
  });

  it('omits optional projection inputs when they are absent', async () => {
    const insert = vi.fn().mockResolvedValue({ id: 'social-post-optional' });
    const persist = createSocialPostPersister({
      episodeId: 'episode-1',
      snapshot,
      episode,
      videoDurationSeconds: 100,
      insert,
    });
    await persist({ platform: 'threads', result: result() });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'threads', videoDurationSec: 100 }),
    );
  });

  it('persists YouTube metadata assembled from the episode', async () => {
    const insert = vi.fn().mockResolvedValue({ id: 'social-post-youtube' });
    const persist = createSocialPostPersister({
      episodeId: 'episode-1',
      snapshot,
      episode,
      videoDurationSeconds: 321,
      insert,
    });
    await persist({ platform: 'youtube', result: result() });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        generatedTitle: 'AI 產生的 YouTube 標題',
        generatedBody:
          '完整說明\n\n更多市場洞察與工具：https://www.zap-pilot.org',
      }),
    );
  });

  it('normalizes non-Error insertion failures in the recovery log', async () => {
    const insert = vi.fn().mockRejectedValue('db offline');
    const onError = vi.fn();
    const persist = createSocialPostPersister({
      episodeId: 'episode-1',
      snapshot,
      episode,
      videoDurationSeconds: 321,
      insert,
      onError,
    });
    await expect(
      persist({ platform: 'threads', result: result() }),
    ).rejects.toBe('db offline');
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('db offline'));
  });

  it('passes native-video duration metadata to the database writer', async () => {
    const insert = vi
      .fn<(post: NewSocialPost) => Promise<SocialPostRow>>()
      .mockResolvedValue({ id: 'social-post-1' } as SocialPostRow);
    const persist = createSocialPostPersister({
      episodeId: 'episode-1',
      snapshot,
      episode,
      videoDurationSeconds: 321,
      insert,
    });

    await persist({ platform: 'x', result: result({ postId: 'x-1' }) });

    expect(insert).toHaveBeenCalledWith(
      buildSocialPostRecord({
        episodeId: 'episode-1',
        platform: 'x',
        result: result({ postId: 'x-1' }),
        snapshot,
        episode,
        videoDurationSeconds: 321,
      }),
    );
  });

  it('logs the exact snake-case payload and rethrows when insertion fails', async () => {
    const failure = new Error('social_posts is unavailable');
    const insert = vi
      .fn<(post: NewSocialPost) => Promise<SocialPostRow>>()
      .mockRejectedValue(failure);
    const onError = vi.fn();
    const persist = createSocialPostPersister({
      episodeId: 'episode-1',
      snapshot,
      episode,
      videoDurationSeconds: 321,
      insert,
      onError,
    });

    await expect(
      persist({ platform: 'threads', result: result() }),
    ).rejects.toBe(failure);

    const message = String(onError.mock.calls[0]?.[0]);
    expect(message).toContain('Post is live, but telemetry was not recorded');
    const payload = JSON.parse(message.slice(message.lastIndexOf('\n') + 1));
    expect(payload).toEqual(
      toSocialPostInsertPayload(
        buildSocialPostRecord({
          episodeId: 'episode-1',
          platform: 'threads',
          result: result(),
          snapshot,
          episode,
          videoDurationSeconds: 321,
        }),
      ),
    );
  });
});

import { describe, expect, it, vi } from 'vitest';

import { toSocialPostInsertPayload } from '../services/db.js';
import type { NewSocialPost, SocialPostRow } from '../types.js';
import {
  buildContentFeatures,
  buildSocialPostRecord,
  createSocialPostPersister,
  type SocialCopySnapshot,
} from './record.js';
import type { GeneratedSocialCopy, PublishResult } from './types.js';

const generated: GeneratedSocialCopy = {
  topic: 'eth',
  hookType: 'surprising_number',
  x: { text: 'AI 產生的短文案' },
  rednote: {
    title: 'AI 產生標題',
    body: 'AI 產生的正文',
    hashtags: ['以太坊', '質押', '投資'],
  },
};

const published: GeneratedSocialCopy = {
  topic: 'macro',
  hookType: 'question',
  x: { text: '編輯後的短文案？２０２６' },
  rednote: {
    title: '利率真的轉向？',
    body: '編輯後的正文含數字２',
    hashtags: ['總經', '利率', '市場事件'],
  },
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
  it.each([
    ['ASCII punctuation and digits', 'Will 2026 change?', true, true],
    ['full-width punctuation and digits', '利率２％會轉向？', true, true],
    ['no question or number', '市場仍在等待', false, false],
  ])(
    'detects %s deterministically',
    (_label, body, containsQuestion, containsNumber) => {
      expect(
        buildContentFeatures({
          title: null,
          body,
          hashtags: ['市場'],
        }),
      ).toEqual({
        containsQuestion,
        containsNumber,
        titleChars: null,
        bodyChars: Array.from(body).length,
        hashtagCount: 1,
      });
    },
  );

  it('counts Unicode code points in a Rednote title and body', () => {
    expect(
      buildContentFeatures({
        title: '利率？',
        body: '第２集🙂',
        hashtags: ['總經', '利率', '市場'],
      }),
    ).toEqual({
      containsQuestion: true,
      containsNumber: true,
      titleChars: 3,
      bodyChars: 4,
      hashtagCount: 3,
    });
  });
});

describe('buildSocialPostRecord', () => {
  it.each(['x', 'threads'] as const)(
    'projects generated and edited short copy for %s',
    (platform) => {
      const post = buildSocialPostRecord({
        episodeId: 'episode-1',
        platform,
        result: result(
          platform === 'x'
            ? {
                url: 'https://x.com/zap/status/123',
                postId: '123',
              }
            : { postId: 'thread-1' },
        ),
        snapshot,
        videoDurationSeconds: 321,
      });

      expect(post).toMatchObject({
        episodeId: 'episode-1',
        platform,
        postUrl: platform === 'x' ? 'https://x.com/zap/status/123' : null,
        platformPostId: platform === 'x' ? '123' : 'thread-1',
        topic: 'macro',
        hookType: 'question',
        generatedTitle: null,
        publishedTitle: null,
        generatedBody: 'AI 產生的短文案',
        publishedBody: '編輯後的短文案？２０２６',
        hashtags: [],
        videoDurationSec: null,
        contentFeatures: {
          containsQuestion: true,
          containsNumber: true,
          titleChars: null,
          bodyChars: Array.from('編輯後的短文案？２０２６').length,
          hashtagCount: 0,
        },
        llmModel: 'openrouter/model-v1',
      });
    },
  );

  it('projects Rednote titles, final hashtags, and video duration without inventing identity', () => {
    expect(
      buildSocialPostRecord({
        episodeId: 'episode-1',
        platform: 'rednote',
        result: result({
          url: 'https://creator.rednote.com/note-manager',
          postId: 'unsupported-rednote-id',
        }),
        snapshot,
        videoDurationSeconds: 321,
      }),
    ).toEqual({
      episodeId: 'episode-1',
      platform: 'rednote',
      postUrl: null,
      platformPostId: null,
      publishedAt: '2026-08-15T01:02:03.000Z',
      topic: 'macro',
      hookType: 'question',
      generatedTitle: 'AI 產生標題',
      publishedTitle: '利率真的轉向？',
      generatedBody: 'AI 產生的正文',
      publishedBody: '編輯後的正文含數字２',
      hashtags: ['總經', '利率', '市場事件'],
      videoDurationSec: 321,
      contentFeatures: {
        containsQuestion: true,
        containsNumber: true,
        titleChars: 7,
        bodyChars: Array.from('編輯後的正文含數字２').length,
        hashtagCount: 3,
      },
      llmModel: 'openrouter/model-v1',
    });
  });
});

describe('createSocialPostPersister', () => {
  it('passes the exact social record to the database writer', async () => {
    const insert = vi
      .fn<(post: NewSocialPost) => Promise<SocialPostRow>>()
      .mockResolvedValue({ id: 'social-post-1' } as SocialPostRow);
    const persist = createSocialPostPersister({
      episodeId: 'episode-1',
      snapshot,
      videoDurationSeconds: 321,
      insert,
    });

    await persist({ platform: 'threads', result: result({ postId: 't-1' }) });

    expect(insert).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith(
      buildSocialPostRecord({
        episodeId: 'episode-1',
        platform: 'threads',
        result: result({ postId: 't-1' }),
        snapshot,
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
      videoDurationSeconds: 321,
      insert,
      onError,
    });

    await expect(
      persist({ platform: 'rednote', result: result() }),
    ).rejects.toBe(failure);

    expect(onError).toHaveBeenCalledOnce();
    const message = String(onError.mock.calls[0]?.[0]);
    expect(message).toContain('Post is live, but telemetry was not recorded');
    expect(message).toContain('social_posts is unavailable');
    const payload = JSON.parse(message.slice(message.lastIndexOf('\n') + 1));
    expect(payload).toEqual(
      toSocialPostInsertPayload(
        buildSocialPostRecord({
          episodeId: 'episode-1',
          platform: 'rednote',
          result: result(),
          snapshot,
          videoDurationSeconds: 321,
        }),
      ),
    );
  });
});

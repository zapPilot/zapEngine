import { describe, expect, it, vi } from 'vitest';

import {
  buildContentFeatures,
  buildSocialPostRecord,
  createSocialPostPersister,
  type SocialCopySnapshot,
} from './record.js';
import type { GeneratedSocialCopy, PublishResult } from './types.js';

const generated: GeneratedSocialCopy = {
  topic: 'macro',
  x: { hookType: 'question', text: '生成文案' },
  threads: { hookType: 'question', text: '生成 Threads 文案' },
  rednote: {
    hookType: 'question',
    body: '生成正文',
    hashtags: ['生成一', '生成二', '生成三'],
  },
  youtube: { hookType: 'explainer' },
};

const published: GeneratedSocialCopy = {
  topic: 'macro',
  x: { hookType: 'question', text: '發布文案' },
  threads: { hookType: 'question', text: '發布 Threads 文案' },
  rednote: {
    hookType: 'question',
    body: '發布正文',
    hashtags: ['發布一', '發布二'],
  },
  youtube: { hookType: 'question' },
};

const snapshot: SocialCopySnapshot = {
  generated,
  published,
  model: 'test/model',
};

const episode = {
  title: '市場更新',
  summary: '摘要',
  description: '完整說明',
};

function result(input?: Partial<PublishResult>): PublishResult {
  return {
    status: 'published',
    publishedAt: '2026-08-15T01:02:03.000Z',
    ...input,
  };
}

describe('record coverage gaps', () => {
  it('carries packaging experiment features into content features', () => {
    // WHY: the packaging spread in buildContentFeatures is only taken when an
    // experiment assignment exists.
    const features = buildContentFeatures({
      title: '標題',
      body: '正文',
      hashtags: ['一'],
      packagingExperiment: { key: 'pack-v1', variant: 'A' },
    });
    expect(features.packagingExperiment).toEqual({
      key: 'pack-v1',
      variant: 'A',
    });
  });

  it('records packaging, destination, override, and experiment lanes', () => {
    // WHY: each optional spread in buildSocialPostRecord needs a present value
    // to cover its true branch.
    const record = buildSocialPostRecord({
      episodeId: 'episode-1',
      platform: 'x',
      languageCode: 'ja',
      experimentKey: 'exp-key',
      experimentVariant: 'B',
      result: result({ url: 'https://x.com/s/1', postId: '1' }),
      snapshot,
      episode,
      videoDurationSeconds: 200,
      destinationUrl: 'https://www.zap-pilot.org/e/1',
      packagingExperiment: { key: 'pack-v1', variant: 'A' },
    });
    expect(record.contentFeatures).toEqual(
      expect.objectContaining({
        packagingExperiment: { key: 'pack-v1', variant: 'A' },
      }),
    );
    expect(record.experimentKey).toBe('exp-key');
  });

  it('persists packaging, destination, and override maps through the persister', async () => {
    // WHY: the persister forwards per-platform maps only when the entry exists.
    const insert = vi.fn().mockResolvedValue({ id: 'post-1' });
    const persist = createSocialPostPersister({
      episodeId: 'episode-1',
      languageCode: 'ja',
      experimentByPlatform: {
        x: { experimentKey: 'k', experimentVariant: 'v' },
      },
      packagingByPlatform: {
        x: { key: 'pack-v1', variant: 'A', instruction: 'do A' },
      },
      destinationUrlByPlatform: { x: 'https://www.zap-pilot.org/e/1' },
      titleOverrideByPlatform: { x: '覆寫標題' },
      snapshot,
      episode,
      videoDurationSeconds: 200,
      xVideoDurationSeconds: 130,
      insert,
    });
    await persist({ platform: 'x', result: result() });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ experimentKey: 'k', videoDurationSec: 130 }),
    );
  });

  it('records rednote title override through the persister map', async () => {
    // WHY: titleOverrideByPlatform true-branch is rednote-specific recovery data.
    const insert = vi.fn().mockResolvedValue({ id: 'post-2' });
    const persist = createSocialPostPersister({
      episodeId: 'episode-1',
      snapshot,
      episode,
      videoDurationSeconds: 321,
      titleOverrideByPlatform: { rednote: '舊佇列短標題' },
      insert,
    });
    await persist({ platform: 'rednote', result: result() });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ publishedTitle: '舊佇列短標題' }),
    );
  });
});

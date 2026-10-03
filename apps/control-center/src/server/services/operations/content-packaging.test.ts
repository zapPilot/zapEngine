import { describe, expect, it } from 'vitest';
import { buildContentPackagingInsight } from './content-packaging.js';
import type { ContentPackagingEvidence } from './content-packaging-source.js';
function evidence(n = 12): ContentPackagingEvidence {
  return {
    posts: Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      episode_id: `e${i}`,
      platform: 'rednote',
      language_code: 'zh-Hant',
      published_at: '2026-09-01T00:00:00Z',
      published_title: i < 6 ? '3個問題？長標題' : '短題',
      review_status: null,
    })),
    metrics: Array.from({ length: n }, (_, i) => ({
      social_post_id: `p${i}`,
      collection_status: 'collected',
      views: i < 6 ? 200 : 100,
      likes: 1,
      comments: null,
      shares: 0,
      saves: 0,
    })),
    localizations: [{ id: 'l0', episode_id: 'e0', title: 'Canonical' }],
    videos: [
      {
        episode_localization_id: 'l0',
        episode_id: 'e0',
        status: 'completed',
        completed_at: '2026-08-31T00:00:00Z',
        thumbnail_url: 'https://example.com/cover.png',
        coverPhoto: {
          sha256: 'hash',
          status: 'ready',
          sourceImageUrl: 'https://example.com/source.png',
          fallbackReason: null,
        },
      },
    ],
  };
}
describe('universal packaging insight', () => {
  it('ranks Rednote, joins shipped cover and shown title, and uses pooled feature rates', () => {
    const result = buildContentPackagingInsight(evidence());
    expect(result.status).toBe('available');
    expect(result.top.map((row) => row.episodeId)).toEqual(['e0', 'e1', 'e2']);
    expect(result.bottom.map((row) => row.episodeId)).toEqual([
      'e9',
      'e8',
      'e7',
    ]);
    expect(result.top[0]).toMatchObject({
      shownTitle: '3個問題？長標題',
      canonicalTitle: 'Canonical',
      cover: { evidence: 'shipped', sha256: 'hash' },
    });
    expect(result.features).toHaveLength(3);
    expect(result.features[0]).toMatchObject({
      with: { n: 6, engagementRate: 0.005 },
      without: { n: 6, engagementRate: 0.01 },
    });
    expect(
      new Set([...result.top, ...result.bottom].map((row) => row.episodeId))
        .size,
    ).toBe(6);
    expect(result).not.toHaveProperty('totalViews');
  });
  it('separates suppressed and distribution-gated notes and ignores unavailable or null metrics', () => {
    const input = evidence();
    input.posts[0]!.review_status = 'under_review';
    input.posts[1]!.review_status = 'rejected';
    input.posts[2]!.review_status = 'self_only';
    input.metrics[3]!.views = 20;
    input.metrics[4]!.views = 0;
    input.metrics[5]!.views = null;
    input.metrics[6]!.collection_status = 'unavailable';
    input.metrics.pop();
    const result = buildContentPackagingInsight(input);
    expect(result.primaryLane).toMatchObject({
      samples: 9,
      suppressed: 3,
      undistributed: 2,
      distributed: 4,
      insufficientBaseline: 4,
      undistributedRatio: 1 / 3,
    });
    expect(result).toMatchObject({
      status: 'insufficient',
      top: [],
      bottom: [],
      features: [],
    });
  });
  it('normalizes confirmation lanes independently and never lets large raw views change rank', () => {
    const input = evidence();
    const expected = buildContentPackagingInsight(input).top.map(
      (row) => row.episodeId,
    );
    input.posts.push(
      ...input.posts.map((post) => ({
        ...post,
        id: `y${post.id}`,
        platform: 'youtube',
        language_code: 'en',
      })),
    );
    input.metrics.push(
      ...input.metrics.map((metric) => ({
        ...metric,
        social_post_id: `y${metric.social_post_id}`,
        views: 1_000_000,
      })),
    );
    const result = buildContentPackagingInsight(input);
    expect(result.top.map((row) => row.episodeId)).toEqual(expected);
    expect(result.top[0]!.confirmations).toEqual([
      { platform: 'youtube', languageCode: 'en', reachLift: 1 },
    ]);
    expect(result.confirmationLanes).toEqual([
      { platform: 'youtube', languageCode: 'en', samples: 12 },
    ]);
  });
  it('removes time trends with local baselines', () => {
    const input = evidence(14);
    input.posts.forEach((post, i) => {
      post.published_at =
        i < 7 ? '2026-09-01T00:00:00Z' : '2026-09-22T00:00:00Z';
    });
    input.metrics.forEach((metric, i) => {
      metric.views = i < 7 ? 100 : 200;
    });
    const result = buildContentPackagingInsight(input);
    expect(
      [...result.top, ...result.bottom].every((row) => row.reachLift === 1),
    ).toBe(true);
  });
  it.each(['late', 'processing', 'reset', 'missing'])(
    'does not show an unverified %s render',
    (reason) => {
      const input = evidence();
      if (reason === 'late') {
        input.videos[0]!.completed_at = '2026-09-02T00:00:00Z';
      }
      if (reason === 'processing') {
        input.videos[0]!.status = 'processing';
      }
      if (reason === 'reset') {
        input.videos[0]!.completed_at = null;
      }
      if (reason === 'missing') {
        input.videos = [];
      }
      expect(buildContentPackagingInsight(input).top[0]!.cover).toEqual({
        evidence: 'unverified',
      });
    },
  );
  it('handles absent provenance, absent titles, insufficient features and empty evidence', () => {
    const input = evidence();
    input.videos[0]!.coverPhoto = null;
    expect(buildContentPackagingInsight(input).top[0]!.cover).toMatchObject({
      evidence: 'shipped',
      sha256: null,
      status: null,
      fallbackReason: null,
      sourceImageUrl: null,
    });
    input.posts.forEach((post) => {
      post.published_title = null;
    });
    expect(buildContentPackagingInsight(input).features).toEqual([]);
    input.posts.forEach((post) => {
      post.published_title = '一致標題';
    });
    expect(buildContentPackagingInsight(input).features).toEqual([]);
    expect(buildContentPackagingInsight(evidence(0)).primaryLane).toMatchObject(
      {
        medianViews: null,
        maxViews: null,
        engagementRate: null,
        undistributedRatio: null,
      },
    );
  });
  it('rejects nonpositive confirmation baselines and breaks ties by engagement then recency', () => {
    const input = evidence(7);
    input.metrics.forEach((metric) => {
      metric.views = 100;
      metric.likes = null;
      metric.shares = null;
      metric.saves = null;
    });
    input.metrics[2]!.likes = 2;
    input.metrics[1]!.comments = 1;
    input.posts[0]!.published_at = '2026-09-02T00:00:00Z';
    input.posts.push(
      ...input.posts.map((post) => ({
        ...post,
        platform: 'x',
        id: `x${post.id}`,
        language_code: null,
      })),
    );
    input.metrics.push(
      ...input.metrics.map((metric) => ({
        ...metric,
        social_post_id: `x${metric.social_post_id}`,
        views: 0,
      })),
    );
    const result = buildContentPackagingInsight(input);
    expect(result.top.map((row) => row.episodeId)).toEqual(['e2', 'e1', 'e0']);
    expect(result.top[0]!.confirmations).toEqual([]);
  });
});
it('excludes suppressed and undistributed secondary Rednote lanes without counting them as primary', () => {
  const input = evidence();
  input.posts[0]!.language_code = 'en';
  input.posts[0]!.review_status = 'rejected';
  input.posts[1]!.language_code = 'en';
  input.metrics[1]!.views = 1;
  const result = buildContentPackagingInsight(input);
  expect(result.primaryLane.suppressed).toBe(0);
  expect(result.primaryLane.undistributed).toBe(0);
  expect(result.confirmationLanes).toEqual([]);
});

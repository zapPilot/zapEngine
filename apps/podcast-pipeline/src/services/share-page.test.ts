import { beforeEach, describe, expect, it, vi } from 'vitest';

import { localizationRow } from '../__fixtures__/index-test.js';
import {
  findEpisodeLocalizationByEpisodeId,
  listCompletedEpisodeVideosByLocalizationIds,
} from './db.js';
import {
  buildEpisodeSharePageHtml,
  detectPlatform,
  extractIosAppId,
  renderEpisodeSharePage,
} from './share-page.js';

vi.mock('./db.js', () => ({
  findEpisodeLocalizationByEpisodeId: vi.fn(),
  listCompletedEpisodeVideosByLocalizationIds: vi.fn(),
}));

const findLocalizationMock = vi.mocked(findEpisodeLocalizationByEpisodeId);
const listVideosMock = vi.mocked(listCompletedEpisodeVideosByLocalizationIds);

describe('detectPlatform', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'ios'],
    ['Mozilla/5.0 (Linux; Android 13; SM-S918B)', 'android'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'desktop'],
    [undefined, 'desktop'],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'ios',
    ],
  ] as const)('returns %s for %s', (userAgent, platform) => {
    expect(detectPlatform(userAgent)).toBe(platform);
  });
});

describe('renderEpisodeSharePage', () => {
  it('renders escaped Open Graph and Twitter metadata', () => {
    const html = renderEpisodeSharePage({
      episode: {
        id: 'episode-1',
        title: 'Markets <script>alert("x")</script>',
        description: 'A preview with "quotes" and <tags>.',
        coverUrl: 'https://cdn.example.com/cover.jpg?x=1&y=2',
      },
      platform: 'desktop',
      iosAppId: '6749248542',
      iosAppStoreUrl: 'https://apps.apple.com/app/id123',
      canonicalUrl: 'https://example.com/e/episode-1?x=1&y=2',
      appDeepLinkUrl: 'zappilotv2://podcast/episode-1',
    });

    expect(html).toContain(
      'property="og:title" content="Markets &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"',
    );
    expect(html).toContain(
      'name="twitter:description" content="A preview with &quot;quotes&quot; and &lt;tags&gt;."',
    );
    expect(html).toContain(
      'property="og:image" content="https://cdn.example.com/cover.jpg?x=1&amp;y=2"',
    );
    expect(html).not.toContain('<script>alert("x")</script>');
  });

  it('renders Smart App Banner metadata and manual iOS actions', () => {
    const html = renderEpisodeSharePage({
      episode: shareEpisode(),
      platform: 'ios',
      iosAppId: '6749248542',
      iosAppStoreUrl:
        'https://apps.apple.com/app/from-fed-to-chain/id6749248542',
      canonicalUrl: 'https://example.com/e/episode-1',
      appDeepLinkUrl: 'zappilotv2://podcast/episode-1',
    });

    expect(html).toContain(
      '<meta name="apple-itunes-app" content="app-id=6749248542, app-argument=zappilotv2://podcast/episode-1">',
    );
    expect(html).not.toContain('<meta http-equiv="refresh"');
    expect(html).toContain(
      '<a class="button" href="zappilotv2://podcast/episode-1">Open in Zap Pilot</a>',
    );
    expect(html).toContain(
      '<a class="button button-secondary" href="https://apps.apple.com/app/from-fed-to-chain/id6749248542">Get Zap Pilot</a>',
    );
    expect(html).not.toContain('window.location.replace');
  });

  it('offers Android users the explicit Zap Pilot deep link', () => {
    const html = renderEpisodeSharePage({
      episode: shareEpisode(),
      platform: 'android',
      iosAppId: '6749248542',
      iosAppStoreUrl: 'https://apps.apple.com/app/id123',
      canonicalUrl: 'https://example.com/e/episode-1',
      appDeepLinkUrl: 'zappilotv2://podcast/episode-1',
    });

    expect(html).not.toContain('http-equiv="refresh"');
    expect(html).toContain('Open in Zap Pilot');
  });

  it('renders a non-autoplay HTML5 MP4 player with its poster', () => {
    const html = renderEpisodeSharePage({
      episode: {
        ...shareEpisode(),
        video: {
          url: 'https://cdn.example.com/video.mp4?x=1&y=2',
          thumbnailUrl: 'https://cdn.example.com/poster.png?x=1&y=2',
          durationSeconds: 90,
        },
      },
      platform: 'desktop',
      iosAppId: '6749248542',
      iosAppStoreUrl: 'https://apps.apple.com/app/id123',
      canonicalUrl: 'https://example.com/e/episode-1',
      appDeepLinkUrl: 'zappilotv2://podcast/episode-1',
    });

    expect(html).toContain(
      '<video class="episode-media" controls playsinline preload="metadata" poster="https://cdn.example.com/poster.png?x=1&amp;y=2"',
    );
    expect(html).toContain(
      '<source src="https://cdn.example.com/video.mp4?x=1&amp;y=2" type="video/mp4">',
    );
    expect(html).toContain('property="og:type" content="video.other"');
    expect(html).not.toContain('autoplay');
  });

  it('truncates description longer than 220 characters in twitter card', () => {
    const longDescription = 'A'.repeat(250);
    const html = renderEpisodeSharePage({
      episode: {
        id: 'episode-1',
        title: 'Episode title',
        description: longDescription,
        coverUrl: 'https://cdn.example.com/cover.jpg',
      },
      platform: 'desktop',
      iosAppId: '6749248542',
      iosAppStoreUrl: 'https://apps.apple.com/app/id123',
      canonicalUrl: 'https://example.com/e/episode-1',
      appDeepLinkUrl: 'zappilotv2://podcast/episode-1',
    });

    const twitterCard = /name="twitter:description" content="([^"]+)"/.exec(
      html,
    );
    expect(twitterCard).toBeTruthy();
    const desc = twitterCard![1]!;
    expect(desc.length).toBeLessThanOrEqual(220);
    expect(desc.endsWith('...')).toBe(true);
  });

  it('uses APP_NAME when episode title is empty', () => {
    const html = renderEpisodeSharePage({
      episode: {
        id: 'episode-1',
        title: '',
        description: 'Description',
        coverUrl: 'https://cdn.example.com/cover.jpg',
      },
      platform: 'desktop',
      iosAppId: '6749248542',
      iosAppStoreUrl: 'https://apps.apple.com/app/id123',
      canonicalUrl: 'https://example.com/e/episode-1',
      appDeepLinkUrl: 'zappilotv2://podcast/episode-1',
    });

    expect(html).toContain('From Fed to Chain');
  });

  it('uses fallback description when episode description is empty', () => {
    const html = renderEpisodeSharePage({
      episode: {
        id: 'episode-1',
        title: 'Episode Title',
        description: '   ',
        coverUrl: 'https://cdn.example.com/cover.jpg',
      },
      platform: 'desktop',
      iosAppId: '6749248542',
      iosAppStoreUrl: 'https://apps.apple.com/app/id123',
      canonicalUrl: 'https://example.com/e/episode-1',
      appDeepLinkUrl: 'zappilotv2://podcast/episode-1',
    });

    const twitterCard = /name="twitter:description" content="([^"]+)"/.exec(
      html,
    );
    expect(twitterCard).toBeTruthy();
    const desc = twitterCard![1]!;
    expect(desc).toContain('Listen to');
    expect(desc).toContain('Episode Title');
  });

  it('uses DEFAULT_DESCRIPTION when title equals APP_NAME and description is empty', () => {
    const html = renderEpisodeSharePage({
      episode: {
        id: 'episode-1',
        title: 'From Fed to Chain',
        description: '   ',
        coverUrl: 'https://cdn.example.com/cover.jpg',
      },
      platform: 'desktop',
      iosAppId: '6749248542',
      iosAppStoreUrl: 'https://apps.apple.com/app/id123',
      canonicalUrl: 'https://example.com/e/episode-1',
      appDeepLinkUrl: 'zappilotv2://podcast/episode-1',
    });

    const twitterCard = /name="twitter:description" content="([^"]+)"/.exec(
      html,
    );
    expect(twitterCard).toBeTruthy();
    const desc = twitterCard![1]!;
    expect(desc).toContain('Listen to');
    expect(desc).toContain('global finance');
  });
});

describe('buildEpisodeSharePageHtml', () => {
  beforeEach(() => {
    findLocalizationMock.mockReset();
    listVideosMock.mockReset();
    listVideosMock.mockResolvedValue(new Map());
  });

  it('uses the script as description when raw_text is null', async () => {
    findLocalizationMock.mockResolvedValue(
      localizationRow({ raw_text: null, script: 'Script body fallback' }),
    );

    const html = await buildEpisodeSharePageHtml({
      id: 'episode-1',
      languageCode: 'zh-Hant',
      userAgent: undefined,
    });

    expect(html).toContain('Script body fallback');
  });

  it('uses an empty description when both raw_text and script are null', async () => {
    findLocalizationMock.mockResolvedValue(
      localizationRow({ raw_text: null, script: null }),
    );

    const html = await buildEpisodeSharePageHtml({
      id: 'episode-1',
      languageCode: 'zh-Hant',
      userAgent: undefined,
    });

    expect(html).not.toBeNull();
    expect(html).toContain('Localization title');
  });

  it('returns null when the localization does not exist', async () => {
    findLocalizationMock.mockResolvedValue(null);

    const html = await buildEpisodeSharePageHtml({
      id: 'missing',
      languageCode: 'zh-Hant',
      userAgent: undefined,
    });

    expect(html).toBeNull();
  });

  it('carries the language into the canonical and app deep links', async () => {
    findLocalizationMock.mockResolvedValue(localizationRow());

    const html = await buildEpisodeSharePageHtml({
      id: 'episode-1',
      languageCode: 'ja',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });

    expect(html).not.toBeNull();
    expect(html).toContain(
      '<link rel="canonical" href="https://from-fed-to-chain-api.fly.dev/e/episode-1?lang=ja">',
    );
    expect(html).toContain(
      `app-argument=zappilotv2://podcast/${localizationRow().id}?lang=ja`,
    );
    expect(html).toContain(
      `<a class="button" href="zappilotv2://podcast/${localizationRow().id}?lang=ja">Open in Zap Pilot</a>`,
    );
  });

  it('loads a completed localization video for the share player', async () => {
    const localization = localizationRow();
    findLocalizationMock.mockResolvedValue(localization);
    listVideosMock.mockResolvedValue(
      new Map([
        [
          localization.id,
          {
            url: 'https://cdn.example.com/video.mp4',
            thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
            durationSeconds: 90,
          },
        ],
      ]),
    );

    const html = await buildEpisodeSharePageHtml({
      id: localization.episode_id,
      languageCode: 'zh-Hant',
      userAgent: undefined,
    });

    expect(listVideosMock).toHaveBeenCalledWith([localization.id]);
    expect(html).toContain('<source src="https://cdn.example.com/video.mp4"');
    expect(html).toContain('poster="https://cdn.example.com/thumbnail.png"');
  });
});

describe('extractIosAppId', () => {
  it('throws when the URL contains no numeric /id segment', () => {
    expect(() => extractIosAppId('https://apps.apple.com/app/name')).toThrow(
      'IOS_APP_STORE_URL must include a numeric /id value',
    );
  });
});

function shareEpisode() {
  return {
    id: 'episode-1',
    title: 'Episode title',
    description: 'Episode description',
    coverUrl: 'https://cdn.example.com/cover.jpg',
  };
}

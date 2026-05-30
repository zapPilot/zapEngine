import { beforeEach, describe, expect, it, vi } from 'vitest';

import { localizationRow } from '../__fixtures__/index-test.js';
import { findEpisodeLocalizationByEpisodeId } from './db.js';
import {
  buildEpisodeSharePageHtml,
  detectPlatform,
  extractIosAppId,
  renderEpisodeSharePage,
} from './share-page.js';

vi.mock('./db.js', () => ({
  findEpisodeLocalizationByEpisodeId: vi.fn(),
}));

const findLocalizationMock = vi.mocked(findEpisodeLocalizationByEpisodeId);

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
      androidAvailable: false,
      canonicalUrl: 'https://example.com/e/episode-1?x=1&y=2',
      appDeepLinkUrl: 'fromfedtochain://e/episode-1',
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
      androidAvailable: false,
      canonicalUrl: 'https://example.com/e/episode-1',
      appDeepLinkUrl: 'fromfedtochain://e/episode-1',
    });

    expect(html).toContain(
      '<meta name="apple-itunes-app" content="app-id=6749248542, app-argument=fromfedtochain://e/episode-1">',
    );
    expect(html).not.toContain('<meta http-equiv="refresh"');
    expect(html).toContain(
      '<a class="button" href="fromfedtochain://e/episode-1">Open in App</a>',
    );
    expect(html).toContain(
      '<a class="button button-secondary" href="https://apps.apple.com/app/from-fed-to-chain/id6749248542">Get the app</a>',
    );
    expect(html).toContain('id="cancel-app-redirect"');
    expect(html).toContain('window.setTimeout');
    expect(html).toContain('4000');
    expect(html).toContain('window.location.replace');
  });

  it('does not auto-redirect Android users before the Android app ships', () => {
    const html = renderEpisodeSharePage({
      episode: shareEpisode(),
      platform: 'android',
      iosAppId: '6749248542',
      iosAppStoreUrl: 'https://apps.apple.com/app/id123',
      androidAvailable: false,
      canonicalUrl: 'https://example.com/e/episode-1',
      appDeepLinkUrl: 'fromfedtochain://e/episode-1',
    });

    expect(html).not.toContain('http-equiv="refresh"');
    expect(html).toContain('Android version coming soon');
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
      androidAvailable: false,
      canonicalUrl: 'https://example.com/e/episode-1',
      appDeepLinkUrl: 'fromfedtochain://e/episode-1',
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
      androidAvailable: false,
      canonicalUrl: 'https://example.com/e/episode-1',
      appDeepLinkUrl: 'fromfedtochain://e/episode-1',
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
      androidAvailable: false,
      canonicalUrl: 'https://example.com/e/episode-1',
      appDeepLinkUrl: 'fromfedtochain://e/episode-1',
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
      androidAvailable: false,
      canonicalUrl: 'https://example.com/e/episode-1',
      appDeepLinkUrl: 'fromfedtochain://e/episode-1',
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

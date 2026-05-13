import { describe, expect, it } from 'vitest';

import { detectPlatform, renderEpisodeSharePage } from './share-page.js';

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
      iosAppStoreUrl: 'https://apps.apple.com/app/id123',
      androidAvailable: false,
      canonicalUrl: 'https://example.com/e/episode-1?x=1&y=2',
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

  it('renders an App Store redirect and button for iOS', () => {
    const html = renderEpisodeSharePage({
      episode: shareEpisode(),
      platform: 'ios',
      iosAppStoreUrl: 'https://apps.apple.com/app/id123',
      androidAvailable: false,
      canonicalUrl: 'https://example.com/e/episode-1',
    });

    expect(html).toContain(
      '<meta http-equiv="refresh" content="1;url=https://apps.apple.com/app/id123">',
    );
    expect(html).toContain('Open in App Store');
  });

  it('does not auto-redirect Android users before the Android app ships', () => {
    const html = renderEpisodeSharePage({
      episode: shareEpisode(),
      platform: 'android',
      iosAppStoreUrl: 'https://apps.apple.com/app/id123',
      androidAvailable: false,
      canonicalUrl: 'https://example.com/e/episode-1',
    });

    expect(html).not.toContain('http-equiv="refresh"');
    expect(html).toContain('Android version coming soon');
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

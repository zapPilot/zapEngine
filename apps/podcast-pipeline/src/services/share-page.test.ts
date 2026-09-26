import { beforeEach, describe, expect, it, vi } from 'vitest';

import { localizationRow } from '../__fixtures__/index-test.js';
import {
  findEpisodeLocalizationByEpisodeId,
  listEpisodeVideoSummariesByLocalizationIds,
} from './db.js';
import { renderEpisodeSharePage, resolveEpisodeShare } from './share-page.js';

vi.mock('./db.js', () => ({
  findEpisodeLocalizationByEpisodeId: vi.fn(),
  listEpisodeVideoSummariesByLocalizationIds: vi.fn(),
}));

const findLocalizationMock = vi.mocked(findEpisodeLocalizationByEpisodeId);
const listVideoSummariesMock = vi.mocked(
  listEpisodeVideoSummariesByLocalizationIds,
);

const BROWSER_USER_AGENTS = [
  [
    'iPhone',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ],
  [
    'Android',
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
  ],
  [
    'desktop',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36',
  ],
] as const;

describe('renderEpisodeSharePage', () => {
  it('renders escaped Open Graph and Twitter metadata', () => {
    const html = renderEpisodeSharePage({
      episode: {
        id: 'episode-1',
        title: 'Markets <script>alert("x")</script>',
        description: 'A preview with "quotes" and <tags>.',
        coverUrl: 'https://cdn.example.com/cover.jpg?x=1&y=2',
      },
      canonicalUrl: 'https://example.com/e/episode-1?x=1&y=2',
      webEpisodeUrl: 'https://v2.zap-pilot.org/podcast/episode-1?lang=zh-Hant',
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

  it('renders a platform-neutral page with only the web action', () => {
    const html = renderEpisodeSharePage({
      episode: shareEpisode(),
      canonicalUrl: 'https://link.zap-pilot.org/e/episode-1?lang=zh-Hant',
      webEpisodeUrl: 'https://v2.zap-pilot.org/podcast/episode-1?lang=zh-Hant',
    });

    expect(html).toContain(
      '<a class="button" href="https://v2.zap-pilot.org/podcast/episode-1?lang=zh-Hant">Listen on the web</a>',
    );
    expect(html).not.toContain('apple-itunes-app');
    expect(html).not.toContain('zappilotv2://');
    expect(html).not.toContain('apps.apple.com');
    expect(html).not.toContain('http-equiv="refresh"');
    expect(html).not.toContain('<script');
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
      canonicalUrl: 'https://example.com/e/episode-1',
      webEpisodeUrl: 'https://v2.zap-pilot.org/podcast/episode-1?lang=zh-Hant',
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
      canonicalUrl: 'https://example.com/e/episode-1',
      webEpisodeUrl: 'https://v2.zap-pilot.org/podcast/episode-1?lang=zh-Hant',
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
      canonicalUrl: 'https://example.com/e/episode-1',
      webEpisodeUrl: 'https://v2.zap-pilot.org/podcast/episode-1?lang=zh-Hant',
    });

    expect(html).toContain('From Fed to Chain');
    expect(html).toContain(
      '<a class="button" href="https://v2.zap-pilot.org/podcast/episode-1?lang=zh-Hant">Listen on the web</a>',
    );
  });

  it('uses fallback description when episode description is empty', () => {
    const html = renderEpisodeSharePage({
      episode: {
        id: 'episode-1',
        title: 'Episode Title',
        description: '   ',
        coverUrl: 'https://cdn.example.com/cover.jpg',
      },
      canonicalUrl: 'https://example.com/e/episode-1',
      webEpisodeUrl: 'https://v2.zap-pilot.org/podcast/episode-1?lang=zh-Hant',
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
      canonicalUrl: 'https://example.com/e/episode-1',
      webEpisodeUrl: 'https://v2.zap-pilot.org/podcast/episode-1?lang=zh-Hant',
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

describe('resolveEpisodeShare', () => {
  beforeEach(() => {
    findLocalizationMock.mockReset();
    listVideoSummariesMock.mockReset();
    listVideoSummariesMock.mockResolvedValue(new Map());
  });

  it.each(BROWSER_USER_AGENTS)(
    'redirects an interactive %s browser to the requested web localization',
    async (_platform, userAgent) => {
      const localization = localizationRow({ language_code: 'en' });
      findLocalizationMock.mockResolvedValue(localization);

      const resolution = await resolveEpisodeShare({
        id: localization.episode_id,
        languageCode: 'en',
        userAgent,
        accept: 'text/html,application/xhtml+xml',
      });

      expect(resolution).toEqual({
        kind: 'redirect',
        location: `https://v2.zap-pilot.org/podcast/${localization.id}?lang=en`,
      });
      expect(listVideoSummariesMock).not.toHaveBeenCalled();
    },
  );

  it.each(['zh-Hant', 'ja', 'en'] as const)(
    'redirects to the %s web localization by localization id',
    async (languageCode) => {
      const localization = localizationRow({ language_code: languageCode });
      findLocalizationMock.mockResolvedValue(localization);

      const resolution = await resolveEpisodeShare({
        id: localization.episode_id,
        languageCode,
        userAgent: BROWSER_USER_AGENTS[2][1],
        accept: 'text/html,application/xhtml+xml',
      });

      expect(resolution).toEqual({
        kind: 'redirect',
        location: `https://v2.zap-pilot.org/podcast/${localization.id}?lang=${languageCode}`,
      });
      expect(
        resolution.kind === 'redirect' ? resolution.location : '',
      ).not.toContain(localization.episode_id);
      expect(listVideoSummariesMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    'facebookexternalhit/1.1',
    'Twitterbot/1.0',
    'TelegramBot (like TwitterBot)',
  ])('keeps preview metadata for crawler %s', async (userAgent) => {
    findLocalizationMock.mockResolvedValue(
      localizationRow({ language_code: 'en' }),
    );

    const resolution = await resolveEpisodeShare({
      id: 'episode-1',
      languageCode: 'en',
      userAgent,
      accept: 'text/html',
    });

    expect(resolution.kind).toBe('page');
    if (resolution.kind !== 'page') return;
    expect(resolution.html).toContain('property="og:title"');
    expect(resolution.html).toContain('property="og:image"');
    expect(resolution.html).toContain('name="twitter:card"');
    expect(resolution.html).toContain(
      '<link rel="canonical" href="https://link.zap-pilot.org/e/episode-1?lang=en">',
    );
    expect(resolution.html).toContain(
      'property="og:url" content="https://link.zap-pilot.org/e/episode-1?lang=en"',
    );
    expect(resolution.html).not.toContain('http-equiv="refresh"');
    expect(resolution.html).not.toContain('window.location');
  });

  it.each([
    ['missing user agent', undefined, 'text/html'],
    [
      'non-browser accept header',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      '*/*',
    ],
  ] as const)(
    'falls back to the HTML page for %s',
    async (_label, userAgent, accept) => {
      findLocalizationMock.mockResolvedValue(localizationRow());

      const resolution = await resolveEpisodeShare({
        id: 'episode-1',
        languageCode: 'zh-Hant',
        userAgent,
        accept,
      });

      expect(resolution.kind).toBe('page');
    },
  );

  it('returns not-found before redirecting or loading video metadata', async () => {
    findLocalizationMock.mockResolvedValue(null);

    const resolution = await resolveEpisodeShare({
      id: 'missing',
      languageCode: 'zh-Hant',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      accept: 'text/html',
    });

    expect(resolution).toEqual({ kind: 'not-found' });
    expect(listVideoSummariesMock).not.toHaveBeenCalled();
  });

  it('uses the script as description when raw_text is null', async () => {
    findLocalizationMock.mockResolvedValue(
      localizationRow({ raw_text: null, script: 'Script body fallback' }),
    );

    const resolution = await resolveEpisodeShare({
      id: 'episode-1',
      languageCode: 'zh-Hant',
      userAgent: undefined,
      accept: undefined,
    });

    expect(resolution.kind).toBe('page');
    if (resolution.kind !== 'page') return;
    expect(resolution.html).toContain('Script body fallback');
  });

  it('uses an empty source description when both raw_text and script are null', async () => {
    findLocalizationMock.mockResolvedValue(
      localizationRow({ raw_text: null, script: null }),
    );

    const resolution = await resolveEpisodeShare({
      id: 'episode-1',
      languageCode: 'zh-Hant',
      userAgent: undefined,
      accept: undefined,
    });

    expect(resolution.kind).toBe('page');
    if (resolution.kind !== 'page') return;
    expect(resolution.html).toContain('Localization title');
  });

  it('carries the language into the canonical and web links', async () => {
    const localization = localizationRow({ language_code: 'ja' });
    findLocalizationMock.mockResolvedValue(localization);

    const resolution = await resolveEpisodeShare({
      id: 'episode-1',
      languageCode: 'ja',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      accept: undefined,
    });

    expect(resolution.kind).toBe('page');
    if (resolution.kind !== 'page') return;
    expect(resolution.html).toContain(
      '<link rel="canonical" href="https://link.zap-pilot.org/e/episode-1?lang=ja">',
    );
    expect(resolution.html).toContain(
      `<a class="button" href="https://v2.zap-pilot.org/podcast/${localization.id}?lang=ja">Listen on the web</a>`,
    );
  });

  it('loads a completed localization video for the share player', async () => {
    const localization = localizationRow();
    findLocalizationMock.mockResolvedValue(localization);
    listVideoSummariesMock.mockResolvedValue(
      new Map([
        [
          localization.id,
          {
            video: {
              url: 'https://cdn.example.com/video.mp4',
              thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
              durationSeconds: 90,
            },
            videoGeneration: {
              status: 'completed' as const,
              updatedAt: '2026-07-24T00:00:00.000Z',
              progressPercent: 100,
              stage: null,
            },
          },
        ],
      ]),
    );

    const resolution = await resolveEpisodeShare({
      id: localization.episode_id,
      languageCode: 'zh-Hant',
      userAgent: undefined,
      accept: undefined,
    });

    expect(listVideoSummariesMock).toHaveBeenCalledWith([localization.id]);
    expect(resolution.kind).toBe('page');
    if (resolution.kind !== 'page') return;
    expect(resolution.html).toContain(
      '<source src="https://cdn.example.com/video.mp4"',
    );
    expect(resolution.html).toContain(
      'poster="https://cdn.example.com/thumbnail.png"',
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

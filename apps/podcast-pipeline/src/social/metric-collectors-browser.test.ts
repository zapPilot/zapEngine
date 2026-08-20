import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SocialPostRow } from '../types.js';

const browser = vi.hoisted(() => ({
  launchPersistentContext: vi.fn(),
}));

vi.mock('playwright-core', () => ({
  chromium: { launchPersistentContext: browser.launchPersistentContext },
}));
vi.mock('./x-playwright.js', () => ({
  PROFILE_DIRECTORY: join(tmpdir(), 'x-profile'),
}));
vi.mock('./rednote-browser.js', () => ({
  PROFILE_DIRECTORY: join(tmpdir(), 'rednote-profile'),
}));
vi.mock('./threads-auth.js', () => ({
  THREADS_INSIGHTS_SCOPE: 'threads_manage_insights',
  assertThreadsSessionReady: vi.fn(),
}));
vi.mock('./youtube-auth.js', () => ({
  YOUTUBE_ANALYTICS_SCOPE: 'yt-analytics',
  assertYouTubeSessionReady: vi.fn(),
}));

import {
  collectRednoteMetrics,
  collectXMetrics,
  createMetricCollectors,
  createMetricsBrowserSession,
  detectRednoteReviewStatus,
  inspectRednotePublishedPost,
  inspectXPublishedPost,
  inspectXPublishedPostAt,
} from './metric-collectors.js';

const X_PROFILE = join(tmpdir(), 'x-profile');
const REDNOTE_PROFILE = join(tmpdir(), 'rednote-profile');
const REDNOTE_MANAGER = 'https://creator.rednote.com/new/note-manager';

function post(
  platform: SocialPostRow['platform'],
  overrides: Partial<SocialPostRow> = {},
): SocialPostRow {
  return {
    id: `${platform}-post-1`,
    episode_id: 'episode-1',
    platform,
    post_url: platform === 'x' ? 'https://x.com/zap/status/1234567890' : null,
    platform_post_id: platform === 'x' ? '1234567890' : null,
    published_at: '2026-08-16T02:00:00.000Z',
    topic: 'macro',
    hook_type: 'question',
    generated_title: platform === 'rednote' ? '生成標題' : null,
    published_title: platform === 'rednote' ? '發佈標題' : null,
    generated_body: 'generated',
    published_body: 'published',
    hashtags: [],
    video_duration_sec: 120,
    content_features: {
      containsQuestion: true,
      containsNumber: false,
      titleChars: platform === 'rednote' ? 4 : null,
      bodyChars: 9,
      hashtagCount: 0,
    },
    llm_model: 'model',
    review_status: null,
    created_at: '2026-08-16T02:00:00.000Z',
    updated_at: '2026-08-16T02:00:00.000Z',
    ...overrides,
  };
}

function promiseMethod<T>(value: T) {
  return vi.fn().mockResolvedValue(value);
}

function metricLocator(input: { aria?: string | null; text?: string } = {}) {
  const leaf = {
    getAttribute: promiseMethod(input.aria ?? null),
    innerText: promiseMethod(input.text ?? ''),
  };
  return { first: () => leaf };
}

function xArticle(
  input: {
    body?: string;
    href?: string | null;
    datetime?: string | null;
    comments?: { aria?: string | null; text?: string };
    reposts?: { aria?: string | null; text?: string };
    likes?: { aria?: string | null; text?: string };
    views?: { aria?: string | null; text?: string };
  } = {},
) {
  const body = input.body ?? 'X published body';
  return {
    waitFor: promiseMethod(undefined),
    locator: vi.fn((selector: string) => {
      if (selector === '[data-testid="reply"]')
        return metricLocator(input.comments);
      if (selector === '[data-testid="retweet"]')
        return metricLocator(input.reposts);
      if (selector === '[data-testid="like"]')
        return metricLocator(input.likes);
      if (selector === 'a[href$="/analytics"]')
        return metricLocator(input.views);
      if (selector === '[data-testid="tweetText"]') {
        return { first: () => ({ innerText: promiseMethod(body) }) };
      }
      if (selector === 'time') {
        return {
          first: () => ({
            getAttribute: promiseMethod(input.datetime ?? null),
          }),
        };
      }
      if (selector === 'a[href*="/status/"]') {
        return {
          first: () => ({ getAttribute: promiseMethod(input.href ?? null) }),
        };
      }
      throw new Error(`unexpected X selector ${selector}`);
    }),
  };
}

function xPage(articles: ReturnType<typeof xArticle>[]) {
  const collection = {
    first: () => articles[0]!,
    count: promiseMethod(articles.length),
    nth: (index: number) => articles[index]!,
  };
  return {
    close: promiseMethod(undefined),
    goto: promiseMethod(undefined),
    locator: vi.fn((selector: string) => {
      if (selector === 'article[data-testid="tweet"]') return collection;
      throw new Error(`unexpected page selector ${selector}`);
    }),
  };
}

interface RednoteCardInput {
  noteId?: string | null;
  time?: string | null;
  title?: string | null;
  duration?: string | null;
  stats?: (string | null)[];
  searchText?: string;
  impressionRaw?: string | null;
  reviewText?: string;
}

function noteImpression(noteId: string): string {
  return JSON.stringify({
    noteTarget: { type: 'NoteTarget', value: { noteId } },
  });
}

function rednoteCard(input: RednoteCardInput = {}) {
  let impression: string | null;
  if (input.impressionRaw !== undefined) {
    impression = input.impressionRaw;
  } else if (input.noteId) {
    impression = noteImpression(input.noteId);
  } else {
    impression = null;
  }
  const card = {
    __searchText: input.searchText ?? input.title ?? '',
    waitFor: promiseMethod(undefined),
    getAttribute: promiseMethod(impression),
    innerText: promiseMethod(
      [input.searchText ?? input.title ?? '', input.reviewText ?? ''].join(
        '\n',
      ),
    ),
    locator: vi.fn((selector: string) => {
      if (selector === '.note-card__time') {
        return { textContent: promiseMethod(input.time ?? null) };
      }
      if (selector === '.note-card__title') {
        return {
          textContent: promiseMethod(
            input.title === undefined ? '' : input.title,
          ),
        };
      }
      if (selector === '.play_time') {
        return { textContent: promiseMethod(input.duration ?? null) };
      }
      if (selector === '.note-card__stat') {
        return {
          evaluateAll: vi.fn(
            async (
              mapNodes: (nodes: { textContent: string | null }[]) => string[],
            ) =>
              mapNodes(
                (input.stats ?? []).map((textContent) => ({ textContent })),
              ),
          ),
        };
      }
      throw new Error(`unexpected card selector ${selector}`);
    }),
  };
  return card;
}

function cardCollection(cards: ReturnType<typeof rednoteCard>[]) {
  const make = (subset: ReturnType<typeof rednoteCard>[]) => ({
    first: () => subset[0]!,
    count: promiseMethod(subset.length),
    nth: (index: number) => subset[index]!,
    filter: ({ hasText }: { hasText: string }) =>
      make(subset.filter((card) => card.__searchText.includes(hasText))),
  });
  return make(cards);
}

function rednotePage(input: {
  cards: ReturnType<typeof rednoteCard>[];
  editorText?: string;
  dedicatedTitle?: string;
  titleError?: Error;
}) {
  const cards = cardCollection(input.cards);
  const editor = {
    waitFor: promiseMethod(undefined),
    innerText: promiseMethod(input.editorText ?? '正文內容\n\n#AI #宏觀'),
  };
  const titleInput = {
    inputValue: input.titleError
      ? vi.fn().mockRejectedValue(input.titleError)
      : promiseMethod(input.dedicatedTitle ?? ''),
  };
  return {
    close: promiseMethod(undefined),
    goto: promiseMethod(undefined),
    locator: vi.fn((selector: string) => {
      if (selector === '.note-card') return cards;
      if (selector === '[contenteditable="true"]') {
        return { first: () => editor };
      }
      if (selector === 'input[placeholder="填写标题会有更多赞哦"]') {
        return { first: () => titleInput };
      }
      throw new Error(`unexpected Rednote page selector ${selector}`);
    }),
  };
}

function installPage(page: object, existing = true) {
  const context = {
    pages: vi.fn(() => (existing ? [page] : [])),
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  browser.launchPersistentContext.mockResolvedValue(context);
  return context;
}

beforeEach(() => {
  vi.clearAllMocks();
  browser.launchPersistentContext.mockReset();
});

describe('X browser metrics and reconciliation', () => {
  it('reads X counts from aria labels and text fallbacks', async () => {
    const page = xPage([
      xArticle({
        comments: { aria: '12 Replies' },
        reposts: { aria: null, text: '3 reposts' },
        likes: { aria: '1.2K Likes' },
        views: { text: '45K Views' },
      }),
    ]);
    const context = installPage(page);

    await expect(collectXMetrics(post('x'))).resolves.toMatchObject({
      views: 45_000,
      likes: 1200,
      comments: 12,
      shares: 3,
    });
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('returns null X counters when neither aria labels nor text are readable', async () => {
    installPage(
      xPage([
        xArticle({
          comments: { aria: null, text: '' },
          reposts: { aria: null, text: 'none' },
          likes: { aria: null, text: '' },
          views: { text: '' },
        }),
      ]),
      false,
    );

    await expect(collectXMetrics(post('x'))).resolves.toMatchObject({
      views: null,
      likes: null,
      comments: null,
      shares: null,
    });
  });

  it('rejects an X metric row without a post URL', async () => {
    await expect(
      collectXMetrics(post('x', { post_url: '  ' })),
    ).rejects.toThrow('has no post_url');
    expect(browser.launchPersistentContext).not.toHaveBeenCalled();
  });

  it('reconciles a known X URL and rejects empty, malformed, or bodyless posts', async () => {
    await expect(inspectXPublishedPost('   ')).rejects.toThrow('without a URL');
    await expect(inspectXPublishedPost('https://x.com/home')).rejects.toThrow(
      'Cannot extract an X post id',
    );

    installPage(xPage([xArticle({ body: '  ' })]));
    await expect(
      inspectXPublishedPost('https://x.com/zap/status/1234567890'),
    ).rejects.toThrow('has no readable body');

    installPage(xPage([xArticle({ body: '  recovered body  ' })]));
    await expect(
      inspectXPublishedPost('https://x.com/zap/status/1234567890'),
    ).resolves.toEqual({
      platformPostId: '1234567890',
      postUrl: 'https://x.com/zap/status/1234567890',
      publishedTitle: null,
      publishedBody: 'recovered body',
      hashtags: [],
      videoDurationSec: null,
    });
  });

  it('matches the nearest X timeline article and ignores unreadable timestamps', async () => {
    const target = '2026-08-16T02:00:00.000Z';
    installPage(
      xPage([
        xArticle({ datetime: null, href: '/zap/status/1', body: 'skip null' }),
        xArticle({
          datetime: 'bad-date',
          href: '/zap/status/2',
          body: 'skip bad',
        }),
        xArticle({
          datetime: '2026-08-16T01:50:00.000Z',
          href: '/zap/status/333',
          body: 'near',
        }),
        xArticle({
          datetime: '2026-08-16T02:20:00.000Z',
          href: '/zap/status/444',
          body: 'farther',
        }),
      ]),
    );

    await expect(
      inspectXPublishedPostAt(target, 'https://x.com/zap'),
    ).resolves.toMatchObject({
      platformPostId: '333',
      postUrl: 'https://x.com/zap/status/333',
      publishedBody: 'near',
    });
  });

  it('rejects invalid X timeline inputs, distant matches, and unreadable matched posts', async () => {
    await expect(
      inspectXPublishedPostAt('bad-time', 'https://x.com/zap'),
    ).rejects.toThrow('invalid timestamp');
    await expect(
      inspectXPublishedPostAt('2026-08-16T02:00:00Z', '   '),
    ).rejects.toThrow('without a profile URL');

    installPage(
      xPage([
        xArticle({
          datetime: '2026-08-16T00:00:00.000Z',
          href: '/zap/status/1',
        }),
      ]),
    );
    await expect(
      inspectXPublishedPostAt('2026-08-16T02:00:00Z', 'https://x.com/zap'),
    ).rejects.toThrow('No X post found within 30 minutes');

    installPage(
      xPage([
        xArticle({
          datetime: '2026-08-16T02:00:00.000Z',
          href: null,
          body: 'body',
        }),
      ]),
    );
    await expect(
      inspectXPublishedPostAt('2026-08-16T02:00:00Z', 'https://x.com/zap'),
    ).rejects.toThrow('id or body is unreadable');
  });
});

describe('Rednote browser metrics and reconciliation', () => {
  it('recovers editor body, hashtags, dedicated title, duration, and note identity', async () => {
    const page = rednotePage({
      cards: [
        rednoteCard({
          noteId: 'note-1',
          time: '2026-08-16 10:00',
          title: 'Manager title',
          duration: '02:05',
        }),
      ],
      editorText: '正文第一段\n\n#AI #聯準會',
      dedicatedTitle: ' Dedicated title ',
    });
    installPage(page);

    await expect(
      inspectRednotePublishedPost('2026-08-16T02:00:00.000Z'),
    ).resolves.toEqual({
      platformPostId: 'note-1',
      postUrl: 'https://www.xiaohongshu.com/explore/note-1',
      publishedTitle: 'Dedicated title',
      publishedBody: '正文第一段',
      hashtags: ['AI', '聯準會'],
      videoDurationSec: 125,
    });
    expect(page.goto).toHaveBeenCalledTimes(2);
  });

  it('falls back from the dedicated title to manager title and then body text', async () => {
    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'note-manager',
            time: '2026-08-16 10:00',
            title: 'Manager fallback',
            duration: '00:20',
          }),
        ],
        editorText: '正文',
        titleError: new Error('input missing'),
      }),
    );
    await expect(
      inspectRednotePublishedPost('2026-08-16T02:00:00.000Z'),
    ).resolves.toMatchObject({ publishedTitle: 'Manager fallback' });

    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'note-body',
            time: '2026-08-16 10:00',
            title: null,
            duration: '00:20',
          }),
        ],
        editorText: '這是一段很長的正文內容超過二十個字元用來當標題',
      }),
    );
    const recovered = await inspectRednotePublishedPost(
      '2026-08-16T02:00:00.000Z',
    );
    expect(recovered.publishedTitle).toBe(recovered.publishedBody.slice(0, 20));
  });

  it('rejects missing note ids, invalid durations, empty body, and distant timestamps', async () => {
    installPage(
      rednotePage({
        cards: [rednoteCard({ time: '2026-08-16 10:00', duration: '00:20' })],
      }),
    );
    await expect(
      inspectRednotePublishedPost('2026-08-16T02:00:00.000Z'),
    ).rejects.toThrow('no readable note id');

    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'note-1',
            time: '2026-08-16 10:00',
            duration: 'bad',
          }),
        ],
      }),
    );
    await expect(
      inspectRednotePublishedPost('2026-08-16T02:00:00.000Z'),
    ).rejects.toThrow('no readable video duration');

    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'note-1',
            time: '2026-08-16 10:00',
            duration: '00:20',
          }),
        ],
        editorText: '   ',
      }),
    );
    await expect(
      inspectRednotePublishedPost('2026-08-16T02:00:00.000Z'),
    ).rejects.toThrow('no readable body');

    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'note-1',
            time: '2026-08-16 08:00',
            duration: '00:20',
          }),
        ],
      }),
    );
    await expect(
      inspectRednotePublishedPost('2026-08-16T02:00:00.000Z'),
    ).rejects.toThrow('could not be matched within 30 minutes');
  });

  it('collects five Rednote counters by durable note id and repairs changed identity', async () => {
    const onIdentity = vi.fn().mockResolvedValue(undefined);
    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'other-note',
            stats: ['1', '2', '3', '4', '5'],
          }),
          rednoteCard({
            noteId: 'wanted-note',
            stats: ['1.2K', '7', '35', '9', '4'],
          }),
        ],
      }),
    );

    await expect(
      collectRednoteMetrics(
        post('rednote', { platform_post_id: 'wanted-note' }),
        onIdentity,
      ),
    ).resolves.toMatchObject({
      views: 1200,
      comments: 7,
      likes: 35,
      saves: 9,
      shares: 4,
    });
    expect(onIdentity).not.toHaveBeenCalled();

    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'new-note',
            searchText: '發佈標題',
            stats: ['10', '2', '3', '4', '5'],
          }),
        ],
      }),
    );
    await createMetricCollectors({ onRednoteIdentity: onIdentity }).rednote(
      post('rednote'),
    );
    expect(onIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        platformPostId: 'new-note',
        postUrl: 'https://www.xiaohongshu.com/explore/new-note',
      }),
    );
  });

  it('returns empty counts when a durable Rednote id disappears', async () => {
    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'different',
            stats: ['1', '2', '3', '4', '5'],
          }),
        ],
      }),
    );

    await expect(
      collectRednoteMetrics(
        post('rednote', { platform_post_id: 'missing-note' }),
      ),
    ).resolves.toMatchObject({
      views: null,
      comments: null,
      likes: null,
      saves: null,
      shares: null,
    });
  });

  it('uses unique title matching, multiple-title timestamp matching, and timestamp fallback', async () => {
    const unique = rednoteCard({
      noteId: 'unique-note',
      searchText: '發佈標題',
      stats: ['10', '1', '2', '3', '4'],
    });
    installPage(rednotePage({ cards: [unique] }));
    await expect(collectRednoteMetrics(post('rednote'))).resolves.toMatchObject(
      {
        views: 10,
      },
    );

    const invalidTime = rednoteCard({
      noteId: 'invalid-time',
      searchText: '發佈標題',
      time: 'bad-format',
      stats: ['15', '1', '2', '3', '4'],
    });
    const impossibleTime = rednoteCard({
      noteId: 'impossible-time',
      searchText: '發佈標題',
      time: '2026-99-99 99:99',
      stats: ['16', '1', '2', '3', '4'],
    });
    const first = rednoteCard({
      noteId: 'first',
      searchText: '發佈標題',
      time: '2026-08-16 09:00',
      stats: ['20', '1', '2', '3', '4'],
    });
    const second = rednoteCard({
      noteId: 'second',
      searchText: '發佈標題',
      time: '2026-08-16 10:00',
      stats: ['30', '1', '2', '3', '4'],
    });
    const farther = rednoteCard({
      noteId: 'farther',
      searchText: '發佈標題',
      time: '2026-08-16 11:00',
      stats: ['35', '1', '2', '3', '4'],
    });
    installPage(
      rednotePage({
        cards: [invalidTime, impossibleTime, first, second, farther],
      }),
    );
    await expect(collectRednoteMetrics(post('rednote'))).resolves.toMatchObject(
      {
        views: 30,
      },
    );

    const fallback = rednoteCard({
      noteId: 'fallback',
      searchText: 'unrelated',
      time: '2026-08-16 10:00',
      stats: ['40', '1', '2', '3', '4'],
    });
    installPage(rednotePage({ cards: [fallback] }));
    await expect(
      collectRednoteMetrics(
        post('rednote', { published_title: null, generated_title: null }),
      ),
    ).resolves.toMatchObject({ views: 40 });
  });

  it('rejects incomplete or unreadable Rednote statistics and invalid publish timestamps', async () => {
    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'short',
            searchText: '發佈標題',
            stats: ['1', '2', '3'],
          }),
        ],
      }),
    );
    await expect(collectRednoteMetrics(post('rednote'))).rejects.toThrow(
      'exposed only 3 statistics',
    );

    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'bad-stat',
            searchText: '發佈標題',
            stats: ['1', 'two', '3', '4', '5'],
          }),
        ],
      }),
    );
    await expect(collectRednoteMetrics(post('rednote'))).rejects.toThrow(
      'unreadable statistic',
    );

    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'time',
            time: null,
            stats: ['1', '2', '3', '4', '5'],
          }),
        ],
      }),
    );
    await expect(
      collectRednoteMetrics(
        post('rednote', {
          published_title: null,
          generated_title: null,
          published_at: 'bad-date',
        }),
      ),
    ).rejects.toThrow('invalid published_at');
  });

  it.each([
    ['审核中', 'under_review'],
    ['審核中', 'under_review'],
    ['待审核', 'under_review'],
    ['审核未通过', 'rejected'],
    ['内容不通过', 'rejected'],
    ['仅自己可见', 'self_only'],
    ['僅自己可見', 'self_only'],
    ['發佈標題\n1.2万 浏览', 'visible'],
    // Precision: a note *about* enforcement is not a suppressed note.
    ['監管違規風險的三個訊號', 'visible'],
  ])('reads %s from the note card as review status %s', (text, expected) => {
    expect(detectRednoteReviewStatus(text)).toBe(expected);
  });

  it('reports a suppressed note instead of recording its zero statistics', async () => {
    const onReviewStatus = vi.fn().mockResolvedValue(undefined);
    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'held-note',
            searchText: '發佈標題',
            reviewText: '审核中',
            stats: ['0', '0', '0', '0', '0'],
          }),
        ],
      }),
    );

    await expect(
      createMetricCollectors({
        onRednoteReviewStatus: onReviewStatus,
      }).rednote(post('rednote', { platform_post_id: 'held-note' })),
    ).resolves.toMatchObject({ views: null, likes: null });
    expect(onReviewStatus).toHaveBeenCalledWith(
      expect.objectContaining({ reviewStatus: 'under_review' }),
    );
  });

  // `under_review` is temporary; without this a single moderation pass would
  // exclude the post from learning forever.
  it('records a recovery back to visible and resumes parsing statistics', async () => {
    const onReviewStatus = vi.fn().mockResolvedValue(undefined);
    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'recovered',
            searchText: '發佈標題',
            stats: ['120', '2', '9', '3', '1'],
          }),
        ],
      }),
    );

    await expect(
      collectRednoteMetrics(
        post('rednote', {
          platform_post_id: 'recovered',
          review_status: 'under_review',
        }),
        undefined,
        undefined,
        onReviewStatus,
      ),
    ).resolves.toMatchObject({ views: 120, likes: 9 });
    expect(onReviewStatus).toHaveBeenCalledWith(
      expect.objectContaining({ reviewStatus: 'visible' }),
    );
  });

  it('writes nothing when the state is unchanged or the card is absent', async () => {
    const onReviewStatus = vi.fn().mockResolvedValue(undefined);
    installPage(
      rednotePage({
        cards: [
          rednoteCard({
            noteId: 'steady',
            searchText: '發佈標題',
            stats: ['80', '1', '4', '2', '0'],
          }),
        ],
      }),
    );
    await collectRednoteMetrics(
      post('rednote', {
        platform_post_id: 'steady',
        review_status: 'visible',
      }),
      undefined,
      undefined,
      onReviewStatus,
    );
    expect(onReviewStatus).not.toHaveBeenCalled();

    // A note missing from the manager page is ambiguous — it is paginated, not
    // necessarily suppressed — so absence must not be recorded as a state.
    installPage(rednotePage({ cards: [rednoteCard({ noteId: 'other' })] }));
    await collectRednoteMetrics(
      post('rednote', { platform_post_id: 'gone' }),
      undefined,
      undefined,
      onReviewStatus,
    );
    expect(onReviewStatus).not.toHaveBeenCalled();
  });
});

describe('metrics browser session', () => {
  function sessionContext() {
    const page = {
      close: promiseMethod(undefined),
      goto: promiseMethod(undefined),
    };
    return {
      page,
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('reuses one context per profile, opens a page per post, and closes every context', async () => {
    const xContext = sessionContext();
    const rednoteContext = sessionContext();
    browser.launchPersistentContext.mockImplementation(
      async (directory: string) =>
        directory === X_PROFILE ? xContext : rednoteContext,
    );

    const session = createMetricsBrowserSession();
    await expect(
      session.withPage(X_PROFILE, 'https://x.com/zap/status/1', async () => 1),
    ).resolves.toBe(1);
    await expect(
      session.withPage(X_PROFILE, 'https://x.com/zap/status/2', async () => 2),
    ).resolves.toBe(2);
    await expect(
      session.withPage(REDNOTE_PROFILE, REDNOTE_MANAGER, async () => 3),
    ).resolves.toBe(3);

    expect(browser.launchPersistentContext).toHaveBeenCalledTimes(2);
    expect(xContext.newPage).toHaveBeenCalledTimes(2);
    expect(xContext.page.close).toHaveBeenCalledTimes(2);
    expect(xContext.page.goto).toHaveBeenLastCalledWith(
      'https://x.com/zap/status/2',
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    );
    expect(xContext.close).not.toHaveBeenCalled();

    await session.close();
    expect(xContext.close).toHaveBeenCalledOnce();
    expect(rednoteContext.close).toHaveBeenCalledOnce();
  });

  it('closes the page and keeps the context when a post fails, and every context on teardown', async () => {
    const first = sessionContext();
    const second = sessionContext();
    first.close.mockRejectedValue(new Error('context teardown failed'));
    browser.launchPersistentContext.mockImplementation(
      async (directory: string) => (directory === X_PROFILE ? first : second),
    );

    const session = createMetricsBrowserSession();
    await expect(
      session.withPage(X_PROFILE, 'https://x.com/zap/status/1', async () => {
        throw new Error('collector exploded');
      }),
    ).rejects.toThrow('collector exploded');
    expect(first.page.close).toHaveBeenCalledOnce();
    await session.withPage(REDNOTE_PROFILE, REDNOTE_MANAGER, async () => null);

    await expect(session.close()).rejects.toThrow('context teardown failed');
    expect(second.close).toHaveBeenCalledOnce();
  });
});

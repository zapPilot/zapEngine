import {
  DEFAULT_PODCAST_LANGUAGE_CODE,
  EPISODE_VIDEO_VISUAL_VERSION,
  isPodcastLanguageCode,
  PODCAST_LANGUAGE_CODES,
  PODCAST_LANGUAGE_LABELS,
  PODCAST_VIDEO_PROGRESS_STAGES,
  PODCAST_VIDEO_RENDER_STAGES,
  PODCAST_VIDEO_REVIEW_ISSUES,
  PODCAST_VIDEO_REVIEW_STATUSES,
  PODCAST_VIDEO_REVIEW_VERDICTS,
  PODCAST_VIDEO_VISUAL_STAGES,
  type PodcastLanguageClassroomKeyword,
  type PodcastLanguageClassroomLesson,
} from '../../../src/shared/podcast.js';

const KEBAB_CASE = /^[a-z]+(?:-[a-z]+)*$/;

describe('podcast language vocabulary', () => {
  it('lists the three canonical languages source-language-first', () => {
    expect(PODCAST_LANGUAGE_CODES).toEqual(['zh-Hant', 'ja', 'en']);
    expect(DEFAULT_PODCAST_LANGUAGE_CODE).toBe('zh-Hant');
  });

  it('recognizes only the three canonical codes', () => {
    for (const code of PODCAST_LANGUAGE_CODES) {
      expect(isPodcastLanguageCode(code)).toBe(true);
    }
    expect(isPodcastLanguageCode('zh-Hans')).toBe(false);
    expect(isPodcastLanguageCode('')).toBe(false);
  });

  it('carries the exact label shape every consumer relies on', () => {
    expect(PODCAST_LANGUAGE_LABELS).toEqual({
      'zh-Hant': {
        english: 'Traditional Chinese',
        native: '繁體中文',
        badge: '中',
        intlLocale: 'zh-TW',
      },
      ja: {
        english: 'Japanese',
        native: '日本語',
        badge: '日',
        intlLocale: 'ja-JP',
      },
      en: {
        english: 'English',
        native: 'English',
        badge: 'EN',
        intlLocale: 'en-US',
      },
    });
  });
});

describe('podcast video stage vocabulary', () => {
  it('is the visual stages, then waiting-for-renderer, then the render-only stages', () => {
    // Both jobs report 'analyzing-audio' independently (each has its own audio
    // to analyze), so it appears once in each job-specific list but must not
    // be duplicated in the combined client-facing progression.
    expect(PODCAST_VIDEO_PROGRESS_STAGES).toEqual([
      ...PODCAST_VIDEO_VISUAL_STAGES,
      'waiting-for-renderer',
      ...PODCAST_VIDEO_RENDER_STAGES.filter(
        (stage) => stage !== 'analyzing-audio',
      ),
    ]);
    expect(PODCAST_VIDEO_PROGRESS_STAGES).toHaveLength(9);
  });

  it('overlaps the two job stage lists only on analyzing-audio', () => {
    const visual = new Set(PODCAST_VIDEO_VISUAL_STAGES);
    const overlap = PODCAST_VIDEO_RENDER_STAGES.filter((stage) =>
      visual.has(stage),
    );
    expect(overlap).toEqual(['analyzing-audio']);
  });
});

describe('podcast shared contracts', () => {
  it('pins the visual version both claim RPCs fence on', () => {
    expect(EPISODE_VIDEO_VISUAL_VERSION).toMatch(
      /^podcast-image-visual-plan\.v\d+$/,
    );
  });

  it.each([
    ['verdicts', PODCAST_VIDEO_REVIEW_VERDICTS],
    ['issues', PODCAST_VIDEO_REVIEW_ISSUES],
    ['statuses', PODCAST_VIDEO_REVIEW_STATUSES],
  ])('keeps review %s non-empty, unique and kebab-case', (_label, values) => {
    expect(values.length).toBeGreaterThan(0);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value).toMatch(KEBAB_CASE);
    }
  });

  it('keeps the catch-all issue category so operators can always file a review', () => {
    expect(PODCAST_VIDEO_REVIEW_ISSUES).toContain('other');
    expect(PODCAST_VIDEO_REVIEW_ISSUES).toContain('abstract-no-image');
  });
});

describe('podcast language classroom lesson shape', () => {
  it('carries a source one-liner plus target-language keywords, nullable fields included', () => {
    const keyword: PodcastLanguageClassroomKeyword = {
      term: '通貨膨脹',
      reading: null,
      meaning: 'inflation',
      note: null,
    };
    const lesson: PodcastLanguageClassroomLesson = {
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCode: 'ja',
      oneLiner: '中央銀行がインフレと戦う。',
      keywords: [keyword],
    };

    expect(lesson).toEqual({
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCode: 'ja',
      oneLiner: '中央銀行がインフレと戦う。',
      keywords: [
        { term: '通貨膨脹', reading: null, meaning: 'inflation', note: null },
      ],
    });
  });
});

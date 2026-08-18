import { describe, expect, it } from 'vitest';

import {
  normalizeClassroomAudioTrack,
  normalizeLanguageClassroomKeyword,
  normalizeLanguageClassroomKeywords,
  normalizeLanguageClassroomLesson,
  normalizeLanguageClassroomLessonDraft,
} from './languageClassroom.js';

describe('normalizeLanguageClassroomKeyword', () => {
  it('trims required fields and converts blank optional fields to null', () => {
    expect(
      normalizeLanguageClassroomKeyword({
        term: ' 流動性 ',
        reading: ' ',
        meaning: ' 資金容易進出市場的程度 ',
        note: ' ',
      }),
    ).toEqual({
      term: '流動性',
      reading: null,
      meaning: '資金容易進出市場的程度',
      note: null,
    });
  });

  it('rejects malformed keywords', () => {
    expect(normalizeLanguageClassroomKeyword(null)).toBeNull();
    expect(normalizeLanguageClassroomKeyword({ term: 'liquidity' })).toBeNull();
    expect(
      normalizeLanguageClassroomKeyword({ meaning: '資金流動性' }),
    ).toBeNull();
  });
});

describe('normalizeLanguageClassroomKeywords', () => {
  it('filters invalid keywords and applies an optional max count', () => {
    const keywords = normalizeLanguageClassroomKeywords(
      [
        { term: 'one', meaning: '一' },
        { term: '', meaning: 'invalid' },
        { term: 'two', meaning: '二' },
      ],
      { maxKeywords: 1 },
    );

    expect(keywords).toEqual([
      {
        term: 'one',
        reading: null,
        meaning: '一',
        note: null,
      },
    ]);
  });
});

describe('normalizeLanguageClassroomLesson', () => {
  it.each([null, undefined, 'str', 42, []])(
    'rejects non-object lesson payload %s',
    (value) => {
      expect(normalizeLanguageClassroomLesson(value)).toBeNull();
    },
  );

  it('requires embedded source language when no fallback is provided', () => {
    expect(
      normalizeLanguageClassroomLesson({
        source_language_code: ' zh-Hant ',
        target_language_code: ' ja ',
        one_liner: ' この記事は市場流動性を説明します。 ',
        keywords: [{ term: '流動性', meaning: '資金流動性' }],
      }),
    ).toEqual({
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCode: 'ja',
      oneLiner: 'この記事は市場流動性を説明します。',
      keywords: [
        {
          term: '流動性',
          reading: null,
          meaning: '資金流動性',
          note: null,
        },
      ],
    });

    expect(
      normalizeLanguageClassroomLesson({
        targetLanguageCode: 'ja',
        oneLiner: 'この記事は市場流動性を説明します。',
      }),
    ).toBeNull();
  });

  it('uses a fallback source language and can require at least one keyword', () => {
    expect(
      normalizeLanguageClassroomLesson(
        {
          targetLanguageCode: 'en',
          oneLiner: 'This article explains liquidity.',
          keywords: [{ term: 'liquidity', meaning: '流動性' }],
        },
        { sourceLanguageCode: 'zh-Hant', requireKeywords: true },
      ),
    ).toEqual({
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCode: 'en',
      oneLiner: 'This article explains liquidity.',
      keywords: [
        {
          term: 'liquidity',
          reading: null,
          meaning: '流動性',
          note: null,
        },
      ],
    });

    expect(
      normalizeLanguageClassroomLesson(
        {
          targetLanguageCode: 'en',
          oneLiner: 'This article explains liquidity.',
          keywords: [],
        },
        { sourceLanguageCode: 'zh-Hant', requireKeywords: true },
      ),
    ).toBeNull();
  });
});

describe('normalizeLanguageClassroomLessonDraft', () => {
  it('carries a non-blank script alongside the normalized lesson', () => {
    expect(
      normalizeLanguageClassroomLessonDraft({
        sourceLanguageCode: 'zh-Hant',
        targetLanguageCode: 'ja',
        oneLiner: 'この記事は市場流動性を説明します。',
        keywords: [{ term: '流動性', meaning: '資金流動性' }],
        script: ' 流動性とは、資産を素早く現金化できる度合いのことです。 ',
      }),
    ).toEqual({
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCode: 'ja',
      oneLiner: 'この記事は市場流動性を説明します。',
      keywords: [
        {
          term: '流動性',
          reading: null,
          meaning: '資金流動性',
          note: null,
        },
      ],
      script: '流動性とは、資産を素早く現金化できる度合いのことです。',
    });
  });

  it('rejects a lesson with a blank or missing script', () => {
    const base = {
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCode: 'ja',
      oneLiner: 'この記事は市場流動性を説明します。',
      keywords: [{ term: '流動性', meaning: '資金流動性' }],
    };

    expect(normalizeLanguageClassroomLessonDraft(base)).toBeNull();
    expect(
      normalizeLanguageClassroomLessonDraft({ ...base, script: '   ' }),
    ).toBeNull();
  });

  it('rejects when the underlying lesson itself is invalid', () => {
    expect(
      normalizeLanguageClassroomLessonDraft({
        targetLanguageCode: 'ja',
        script: 'valid script',
      }),
    ).toBeNull();
  });
});

describe('normalizeClassroomAudioTrack', () => {
  it('reads camelCase and snake_case field names', () => {
    expect(
      normalizeClassroomAudioTrack({
        targetLanguageCode: 'ja',
        hlsUrl: 'https://example.test/ja/playlist.m3u8',
      }),
    ).toEqual({
      languageCode: 'ja',
      hlsUrl: 'https://example.test/ja/playlist.m3u8',
    });

    expect(
      normalizeClassroomAudioTrack({
        target_language_code: 'en',
        hls_url: 'https://example.test/en/playlist.m3u8',
      }),
    ).toEqual({
      languageCode: 'en',
      hlsUrl: 'https://example.test/en/playlist.m3u8',
    });
  });

  it('treats a blank or missing hls url as absent', () => {
    expect(
      normalizeClassroomAudioTrack({ targetLanguageCode: 'ja', hlsUrl: '  ' }),
    ).toBeNull();
    expect(
      normalizeClassroomAudioTrack({ targetLanguageCode: 'ja' }),
    ).toBeNull();
    expect(normalizeClassroomAudioTrack(null)).toBeNull();
  });
});

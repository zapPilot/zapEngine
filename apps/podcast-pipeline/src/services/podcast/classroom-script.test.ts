import { describe, expect, it } from 'vitest';

import type { LanguageClassroomLesson } from '../../types.js';
import { buildClassroomSegments } from './classroom-script.js';

describe('buildClassroomSegments', () => {
  it('orders classroom narration segments with target-language terms and zh-Hant explanations', () => {
    const lesson: LanguageClassroomLesson = {
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCode: 'ja',
      oneLiner: 'この記事は市場流動性を説明します。',
      keywords: [
        {
          term: '流動性',
          reading: 'りゅうどうせい',
          meaning: '資金容易進出市場的程度',
          note: '金融新聞常用來描述市場深度。',
        },
        {
          term: '金利',
          reading: null,
          meaning: '利率',
          note: null,
        },
      ],
    };

    expect(buildClassroomSegments(lesson)).toEqual([
      {
        text: '接下來是日文小教室。',
        languageCode: 'zh-Hant',
      },
      {
        text: 'この記事は市場流動性を説明します。',
        languageCode: 'ja',
      },
      {
        text: '流動性，りゅうどうせい。',
        languageCode: 'ja',
      },
      {
        text: '意思是資金容易進出市場的程度。',
        languageCode: 'zh-Hant',
      },
      {
        text: '補充：金融新聞常用來描述市場深度。',
        languageCode: 'zh-Hant',
      },
      {
        text: '金利。',
        languageCode: 'ja',
      },
      {
        text: '意思是利率。',
        languageCode: 'zh-Hant',
      },
    ]);
  });

  it('throws when targetLanguageCode is not a supported language classroom code', () => {
    const lesson: LanguageClassroomLesson = {
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCode: 'fr',
      oneLiner: 'Bonjour le monde',
      keywords: [],
    };

    expect(() => buildClassroomSegments(lesson)).toThrow(
      'Unsupported language classroom code: fr',
    );
  });

  it('returns empty segment when oneLiner is only whitespace', () => {
    const lesson: LanguageClassroomLesson = {
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCode: 'ja',
      oneLiner: '   ',
      keywords: [],
    };

    const segments = buildClassroomSegments(lesson);
    expect(segments).toEqual([
      {
        text: '接下來是日文小教室。',
        languageCode: 'zh-Hant',
      },
      {
        text: '',
        languageCode: 'ja',
      },
    ]);
  });
});

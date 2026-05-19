import {
  LANGUAGE_CLASSROOM_LANGUAGE_CODES,
  type LanguageClassroomLanguageCode,
  type LanguageClassroomLesson,
} from '../../types.js';

export interface ClassroomScriptSegment {
  text: string;
  languageCode: LanguageClassroomLanguageCode;
}

const TARGET_LANGUAGE_NAMES: Record<LanguageClassroomLanguageCode, string> = {
  'zh-Hant': '繁體中文',
  ja: '日文',
  en: '英文',
};

const LOCALIZED_TARGET_LANGUAGE_NAMES: Record<
  LanguageClassroomLanguageCode,
  Record<LanguageClassroomLanguageCode, string>
> = {
  'zh-Hant': {
    'zh-Hant': '繁體中文',
    ja: '日文',
    en: '英文',
  },
  ja: {
    'zh-Hant': '繁体中国語',
    ja: '日本語',
    en: '英語',
  },
  en: {
    'zh-Hant': 'Traditional Chinese',
    ja: 'Japanese',
    en: 'English',
  },
};

export function buildClassroomSegments(
  lesson: LanguageClassroomLesson,
): ClassroomScriptSegment[] {
  const sourceLanguageCode = parseLanguageClassroomLanguageCode(
    lesson.sourceLanguageCode,
  );
  const targetLanguageCode = parseLanguageClassroomLanguageCode(
    lesson.targetLanguageCode,
  );
  const segments: ClassroomScriptSegment[] = [
    {
      text: classroomIntro(sourceLanguageCode, targetLanguageCode),
      languageCode: sourceLanguageCode,
    },
    {
      text: ensureSentenceEnding(lesson.oneLiner, targetLanguageCode),
      languageCode: targetLanguageCode,
    },
  ];

  for (const keyword of lesson.keywords) {
    segments.push({
      text: ensureSentenceEnding(
        keyword.reading ? `${keyword.term}，${keyword.reading}` : keyword.term,
        targetLanguageCode,
      ),
      languageCode: targetLanguageCode,
    });
    segments.push({
      text: keywordMeaning(sourceLanguageCode, keyword.meaning),
      languageCode: sourceLanguageCode,
    });

    if (keyword.note) {
      segments.push({
        text: keywordNote(sourceLanguageCode, keyword.note),
        languageCode: sourceLanguageCode,
      });
    }
  }

  return segments;
}

function parseLanguageClassroomLanguageCode(
  languageCode: string,
): LanguageClassroomLanguageCode {
  if (
    LANGUAGE_CLASSROOM_LANGUAGE_CODES.includes(
      languageCode as LanguageClassroomLanguageCode,
    )
  ) {
    return languageCode as LanguageClassroomLanguageCode;
  }

  throw new Error(`Unsupported language classroom code: ${languageCode}`);
}

function classroomIntro(
  sourceLanguageCode: LanguageClassroomLanguageCode,
  targetLanguageCode: LanguageClassroomLanguageCode,
): string {
  // The localized name table is exhaustive for every validated source/target pair.
  /* v8 ignore start -- @preserve */
  const targetName =
    LOCALIZED_TARGET_LANGUAGE_NAMES[sourceLanguageCode][targetLanguageCode] ??
    TARGET_LANGUAGE_NAMES[targetLanguageCode];
  /* v8 ignore stop -- @preserve */

  switch (sourceLanguageCode) {
    case 'zh-Hant':
      return `接下來是${targetName}小教室。`;
    case 'ja':
      return `次は${targetName}ミニレッスンです。`;
    case 'en':
      return `Next is the ${targetName} language classroom.`;
  }
}

function keywordMeaning(
  sourceLanguageCode: LanguageClassroomLanguageCode,
  meaning: string,
): string {
  switch (sourceLanguageCode) {
    case 'zh-Hant':
      return ensureSentenceEnding(`意思是${meaning}`, sourceLanguageCode);
    case 'ja':
      return ensureSentenceEnding(
        `${meaning}という意味です`,
        sourceLanguageCode,
      );
    case 'en':
      return ensureSentenceEnding(`It means ${meaning}`, sourceLanguageCode);
  }
}

function keywordNote(
  sourceLanguageCode: LanguageClassroomLanguageCode,
  note: string,
): string {
  switch (sourceLanguageCode) {
    case 'zh-Hant':
      return ensureSentenceEnding(`補充：${note}`, sourceLanguageCode);
    case 'ja':
      return ensureSentenceEnding(`補足：${note}`, sourceLanguageCode);
    case 'en':
      return ensureSentenceEnding(`Note: ${note}`, sourceLanguageCode);
  }
}

function ensureSentenceEnding(
  text: string,
  languageCode: LanguageClassroomLanguageCode,
): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/[。！？.!?]$/.test(trimmed)) return trimmed;
  return languageCode === 'en' ? `${trimmed}.` : `${trimmed}。`;
}

import {
  DEFAULT_LANGUAGE_CODE,
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

export function buildClassroomSegments(
  lesson: LanguageClassroomLesson,
): ClassroomScriptSegment[] {
  const targetLanguageCode = parseLanguageClassroomLanguageCode(
    lesson.targetLanguageCode,
  );
  const segments: ClassroomScriptSegment[] = [
    {
      text: `接下來是${TARGET_LANGUAGE_NAMES[targetLanguageCode]}小教室。`,
      languageCode: DEFAULT_LANGUAGE_CODE,
    },
    {
      text: ensureSentenceEnding(lesson.oneLiner),
      languageCode: targetLanguageCode,
    },
  ];

  for (const keyword of lesson.keywords) {
    segments.push({
      text: ensureSentenceEnding(
        keyword.reading ? `${keyword.term}，${keyword.reading}` : keyword.term,
      ),
      languageCode: targetLanguageCode,
    });
    segments.push({
      text: ensureSentenceEnding(`意思是${keyword.meaning}`),
      languageCode: DEFAULT_LANGUAGE_CODE,
    });

    if (keyword.note) {
      segments.push({
        text: ensureSentenceEnding(`補充：${keyword.note}`),
        languageCode: DEFAULT_LANGUAGE_CODE,
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

function ensureSentenceEnding(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /[。！？.!?]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

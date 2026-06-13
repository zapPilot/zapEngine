import type { LanguageClassroomLanguageCode } from '../../types.js';

type ClassroomTargetsBySourceLanguage = Record<
  LanguageClassroomLanguageCode,
  LanguageClassroomLanguageCode[]
>;

const CLASSROOM_TARGETS_BY_SOURCE_LANGUAGE = {
  'zh-Hant': ['ja', 'en'],
  ja: [],
  en: [],
} satisfies ClassroomTargetsBySourceLanguage;

export function getClassroomTargetLanguageCodes(
  sourceLanguageCode: LanguageClassroomLanguageCode,
): LanguageClassroomLanguageCode[] {
  return [...CLASSROOM_TARGETS_BY_SOURCE_LANGUAGE[sourceLanguageCode]];
}

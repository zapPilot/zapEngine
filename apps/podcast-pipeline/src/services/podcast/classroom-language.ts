import {
  LANGUAGE_CLASSROOM_LANGUAGE_CODES,
  type LanguageClassroomLanguageCode,
} from '../../types.js';

export function parseLanguageClassroomLanguageCode(
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

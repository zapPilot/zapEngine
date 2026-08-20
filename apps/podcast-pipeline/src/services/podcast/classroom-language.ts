import {
  LANGUAGE_CLASSROOM_LANGUAGE_CODES,
  type LanguageClassroomLanguageCode,
} from '../../types.js';

function isLanguageClassroomLanguageCode(
  languageCode: string,
): languageCode is LanguageClassroomLanguageCode {
  return LANGUAGE_CLASSROOM_LANGUAGE_CODES.includes(
    languageCode as LanguageClassroomLanguageCode,
  );
}

export function parseLanguageClassroomLanguageCode(
  languageCode: string,
): LanguageClassroomLanguageCode {
  if (isLanguageClassroomLanguageCode(languageCode)) {
    return languageCode;
  }

  throw new Error(`Unsupported language classroom code: ${languageCode}`);
}

/**
 * Localized presentation copy (video CTA, headline kicker) must render for any
 * localization, so an unsupported code degrades to English instead of failing
 * the render. Keying that copy by `LanguageClassroomLanguageCode` is what makes
 * a newly supported language a type error here rather than a silent fallback.
 */
export function coerceToSupportedLanguage(
  languageCode: string,
): LanguageClassroomLanguageCode {
  return isLanguageClassroomLanguageCode(languageCode) ? languageCode : 'en';
}

/**
 * Podcast/content language options, ported from the retired Flutter mobile
 * app (`apps/mobile/lib/config/language_codes.dart`).
 */
export interface ContentLanguageOption {
  /** BCP-47 style code sent to the podcast API (`/episodes?language=`). */
  code: string;
  /** Compact badge label shown next to the language name. */
  badge: string;
  /** Native display name. */
  nativeName: string;
}

export const CONTENT_LANGUAGE_OPTIONS = [
  { code: 'en', badge: 'EN', nativeName: 'English' },
  { code: 'zh-Hant', badge: '中', nativeName: '繁體中文' },
  { code: 'ja', badge: '日', nativeName: '日本語' },
] as const satisfies readonly ContentLanguageOption[];

export type ContentLanguageCode =
  (typeof CONTENT_LANGUAGE_OPTIONS)[number]['code'];

export const DEFAULT_CONTENT_LANGUAGE_CODE: ContentLanguageCode = 'zh-Hant';

/** Mirrors the mobile storage key so the preference stays conceptually the same. */
export const CONTENT_LANGUAGE_STORAGE_KEY = 'content_language_code';

export function isContentLanguageCode(
  value: string,
): value is ContentLanguageCode {
  return CONTENT_LANGUAGE_OPTIONS.some((option) => option.code === value);
}

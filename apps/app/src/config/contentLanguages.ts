/**
 * Podcast/content language options, ported from the retired Flutter mobile
 * app (`apps/mobile/lib/config/language_codes.dart`).
 */
import { PODCAST_LANGUAGE_LABELS } from '@zapengine/types/shared';

export interface ContentLanguageOption {
  /** BCP-47 style code sent to the podcast API (`/episodes?language=`). */
  code: string;
  /** Compact badge label shown next to the language name. */
  badge: string;
  /** Native display name. */
  nativeName: string;
}

/**
 * Same three canonical languages and badge/native labels as
 * `@zapengine/types/shared`'s `PODCAST_LANGUAGE_LABELS`, reordered for this
 * app's own display order (English first) rather than the pipeline's
 * source-language-first order.
 */
export const CONTENT_LANGUAGE_OPTIONS = [
  {
    code: 'en',
    badge: PODCAST_LANGUAGE_LABELS.en.badge,
    nativeName: PODCAST_LANGUAGE_LABELS.en.native,
  },
  {
    code: 'zh-Hant',
    badge: PODCAST_LANGUAGE_LABELS['zh-Hant'].badge,
    nativeName: PODCAST_LANGUAGE_LABELS['zh-Hant'].native,
  },
  {
    code: 'ja',
    badge: PODCAST_LANGUAGE_LABELS.ja.badge,
    nativeName: PODCAST_LANGUAGE_LABELS.ja.native,
  },
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

/** Compact badge for a language code (e.g. a chip or pill), falling back to its first two letters. */
export function contentLanguageBadge(languageCode: string): string {
  return (
    CONTENT_LANGUAGE_OPTIONS.find((option) => option.code === languageCode)
      ?.badge ?? languageCode.slice(0, 2).toUpperCase()
  );
}

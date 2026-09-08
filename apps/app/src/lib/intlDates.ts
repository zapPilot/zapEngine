import { PODCAST_LANGUAGE_LABELS } from '@zapengine/types/shared';

import type { ContentLanguageCode } from '@/config/contentLanguages';

/** BCP-47 locale for each content language, shared by every `Intl.DateTimeFormat` caller. */
export const CONTENT_LANGUAGE_LOCALES: Readonly<
  Record<ContentLanguageCode, string>
> = {
  en: PODCAST_LANGUAGE_LABELS.en.intlLocale,
  'zh-Hant': PODCAST_LANGUAGE_LABELS['zh-Hant'].intlLocale,
  ja: PODCAST_LANGUAGE_LABELS.ja.intlLocale,
};

/**
 * One formatter per (locale, options) pair. Constructing an `Intl.DateTimeFormat`
 * costs far more than formatting with one, and callers may re-format the same
 * locale/options combination on every render or pointer move. Options are part
 * of the key because callers vary them (e.g. a short vs. a long date style).
 */
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function cachedDateFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  const cached = dateFormatters.get(key);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat(locale, options);
  dateFormatters.set(key, formatter);
  return formatter;
}

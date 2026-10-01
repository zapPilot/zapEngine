import type { ContentLanguageCode } from '@/config/contentLanguages';

export type MessageParams = Readonly<Record<string, string | number>>;
export interface Message<Key extends string> {
  key: Key;
  params?: MessageParams;
}

export function interpolate(template: string, params?: MessageParams): string {
  if (params === undefined) return template;
  return template.replace(/\{([^}]+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

/** Explicit rules keep this independent of Hermes' Intl.PluralRules support. */
export function pluralCategory(
  language: ContentLanguageCode,
  count: number,
): 'one' | 'other' {
  return language === 'en' && count === 1 ? 'one' : 'other';
}

export function createTranslator<Key extends string>(
  dictionary: Readonly<Record<Key, string>>,
) {
  return (key: Key, params?: MessageParams): string =>
    interpolate(dictionary[key], params);
}

export function formatMessage<Key extends string>(
  translate: (key: Key, params?: MessageParams) => string,
  message: Message<Key>,
): string {
  return translate(message.key, message.params);
}

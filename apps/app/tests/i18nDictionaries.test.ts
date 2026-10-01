import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '@/i18n/translations';
const placeholders = (text: string) =>
  [...text.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
describe('interface dictionaries', () => {
  for (const [language, dictionary] of Object.entries(TRANSLATIONS)) {
    it(
      language + ' has matching keys, placeholders, and nonempty messages',
      () => {
        expect(Object.keys(dictionary).sort()).toEqual(
          Object.keys(TRANSLATIONS.en).sort(),
        );
        for (const [key, text] of Object.entries(dictionary)) {
          expect(text.trim(), key).not.toBe('');
          expect(placeholders(text), key).toEqual(
            placeholders(TRANSLATIONS.en[key as keyof typeof TRANSLATIONS.en]),
          );
        }
      },
    );
  }
});

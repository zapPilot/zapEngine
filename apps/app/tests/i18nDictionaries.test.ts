import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '@/i18n/translations';
const placeholders = (text: string) =>
  [...text.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
/**
 * Positioning the product has retired: Zap Pilot never manages, rebalances, or
 * executes on its own, so no interface copy may imply it does.
 */
const RETIRED_TERMS = [
  'autopilot',
  'auto-managed',
  'Zap Strategy',
  'robo',
  '自動駕駛',
  '智能投顧',
  '代操',
  'オートパイロット',
  'ロボアドバイザー',
  '自動運用',
];
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
    it(language + ' uses none of the retired positioning terms', () => {
      const hits = Object.entries(dictionary).flatMap(([key, text]) =>
        RETIRED_TERMS.filter((term) =>
          text.toLowerCase().includes(term.toLowerCase()),
        ).map((term) => `${key}: ${term}`),
      );
      expect(hits).toEqual([]);
    });
  }
});

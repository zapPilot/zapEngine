import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  formatMessage,
  interpolate,
  pluralCategory,
} from '@/lib/i18n';
describe('message formatting', () => {
  it('preserves missing placeholders and handles zero and Unicode', () => {
    expect(
      interpolate('{name}: {count} · {missing}', { name: '繁體', count: 0 }),
    ).toBe('繁體: 0 · {missing}');
    expect(interpolate('{count}')).toBe('{count}');
    expect(interpolate('Text', {})).toBe('Text');
  });
  it('uses explicit plural rules for all supported languages', () => {
    for (const language of ['en', 'zh-Hant', 'ja'] as const) {
      for (const count of [0, 1, 2, -1, 1.5]) {
        expect(pluralCategory(language, count)).toBe(
          language === 'en' && count === 1 ? 'one' : 'other',
        );
      }
    }
  });
  it('formats descriptors with the selected dictionary', () => {
    const t = createTranslator({ greeting: 'Hello {name}', empty: 'Empty' });
    expect(t('greeting', { name: 'Ada' })).toBe('Hello Ada');
    expect(formatMessage(t, { key: 'greeting', params: { name: 'Lin' } })).toBe(
      'Hello Lin',
    );
    expect(formatMessage(t, { key: 'empty' })).toBe('Empty');
  });
});

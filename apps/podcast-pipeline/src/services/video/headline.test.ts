import { describe, expect, it } from 'vitest';

import { headlineKickerFor, wrapHeadlineTitle } from './headline.js';
import { HEADLINE_MAX_UNITS_PER_LINE } from './manifest.js';
import { lineUnits } from './text-units.js';

describe('headlineKickerFor', () => {
  it('maps each supported language and falls back to English', () => {
    expect(headlineKickerFor('zh-Hant')).toBe('鏈上快訊');
    expect(headlineKickerFor('ja')).toBe('チェーン速報');
    expect(headlineKickerFor('en')).toBe('CHAIN BRIEF');
    expect(headlineKickerFor('ko')).toBe('CHAIN BRIEF');
  });

  it('keeps every kicker within the headline unit budget', () => {
    for (const language of ['zh-Hant', 'ja', 'en']) {
      expect(lineUnits(headlineKickerFor(language))).toBeLessThanOrEqual(
        HEADLINE_MAX_UNITS_PER_LINE,
      );
    }
  });
});

describe('wrapHeadlineTitle', () => {
  it('keeps a short title on a single line', () => {
    expect(wrapHeadlineTitle('世界盃最賺錢的生意')).toEqual([
      '世界盃最賺錢的生意',
    ]);
  });

  it('wraps CJK titles at the unit budget', () => {
    const title = '世界盃球星卡暴漲三百倍炒到幾千萬的瘋狂生意';
    const lines = wrapHeadlineTitle(title);
    expect(lines).toEqual(['世界盃球星卡暴漲三百倍炒到幾', '千萬的瘋狂生意']);
    for (const line of lines) {
      expect(lineUnits(line)).toBeLessThanOrEqual(HEADLINE_MAX_UNITS_PER_LINE);
    }
  });

  it('never splits inside a Latin word', () => {
    const lines = wrapHeadlineTitle('Bitcoin ETF approval sparks rally');
    expect(lines.join(' ')).toBe('Bitcoin ETF approval sparks rally');
    for (const line of lines) {
      expect(lineUnits(line)).toBeLessThanOrEqual(HEADLINE_MAX_UNITS_PER_LINE);
    }
  });

  it('wraps mixed CJK and Latin titles without breaking words', () => {
    const lines = wrapHeadlineTitle('比特幣ETF通過後的連鎖效應與市場衝擊');
    expect(lines.every((line) => !line.includes('ET F'))).toBe(true);
    expect(lines.flatMap((line) => Array.from(line)).join('')).toContain('ETF');
    for (const line of lines) {
      expect(lineUnits(line)).toBeLessThanOrEqual(HEADLINE_MAX_UNITS_PER_LINE);
    }
  });

  it('hard-splits a single oversized token instead of stalling', () => {
    const lines = wrapHeadlineTitle('A'.repeat(80), { maxLines: 4 });
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(lineUnits(line)).toBeLessThanOrEqual(HEADLINE_MAX_UNITS_PER_LINE);
    }
  });

  it('truncates overflow onto the last allowed line with an ellipsis', () => {
    const lines = wrapHeadlineTitle('富'.repeat(60));
    expect(lines).toHaveLength(3);
    expect(lines.at(-1)).toMatch(/…$/);
    for (const line of lines) {
      expect(lineUnits(line)).toBeLessThanOrEqual(HEADLINE_MAX_UNITS_PER_LINE);
    }
  });

  it('rejects titles with no displayable content', () => {
    expect(() => wrapHeadlineTitle('   ')).toThrow(
      'Headline title produced no displayable lines',
    );
  });
});

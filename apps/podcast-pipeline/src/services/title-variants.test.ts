import { describe, expect, it } from 'vitest';

import {
  SOCIAL_LANGUAGE_BY_PLATFORM,
  socialTitleBudgetsFor,
} from '../social/policy.js';
import { fitTitleToBudget, readTitleVariant } from './title-variants.js';
import { TRANSLATED_TITLE_MAX_CHARACTERS } from './translate.js';

describe('title budgets', () => {
  it('derives transport budgets from language policy and translation contract', () => {
    expect(socialTitleBudgetsFor('zh-Hant')).toEqual([20]);
    expect(socialTitleBudgetsFor('en')).toEqual([
      TRANSLATED_TITLE_MAX_CHARACTERS.en,
    ]);
    expect(socialTitleBudgetsFor('ja')).toEqual([]);
  });
  it('collects all matching budgets in order when two title transports share a language', () => {
    const mapping = SOCIAL_LANGUAGE_BY_PLATFORM as Record<string, string>;
    const previous = mapping['youtube'];
    try {
      mapping['youtube'] = 'zh-Hant';
      expect(socialTitleBudgetsFor('zh-Hant')).toEqual([20, 100]);
    } finally {
      mapping['youtube'] = previous!;
    }
  });
  it.each([
    '😀'.repeat(30),
    'USDT买美股：你拿到的究竟是什么？凭证还是合约？',
    'Dan Koe 最新長文：要想成功，你就得活在幻想中',
    'A'.repeat(101),
    '「'.repeat(21),
  ])('fits code points: %s', (title) => {
    expect([...fitTitleToBudget(title, 20)].length).toBeLessThanOrEqual(20);
  });
  it.each([
    null,
    [],
    'bad',
    {},
    { '20': null },
    { '20': { title: 1, method: 'llm' } },
    { '20': { title: '有效标题', method: 'other' } },
    { '20': { title: '有效标题', method: ['llm'] } },
    { '20': { title: '標'.repeat(21), method: 'llm' } },
    { '20': { title: ' ', method: 'truncate' } },
    { '20': { title: '标题\n第二行', method: 'llm' } },
  ])('ignores malformed jsonb: %j', (raw) => {
    expect(readTitleVariant(raw, 20)).toBeNull();
  });
  it.each(['llm', 'truncate'])(
    'reads only the matching budget with method %s',
    (method) => {
      expect(
        readTitleVariant(
          {
            '20': { title: ' 简短标题 ', method },
            '100': { title: '其他标题', method },
          },
          20,
        ),
      ).toBe('简短标题');
    },
  );
});

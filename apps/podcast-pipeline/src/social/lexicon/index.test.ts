import { describe, expect, it } from 'vitest';

import {
  assertRednoteCopySafe,
  describeSensitiveMatches,
  findSensitiveTerms,
} from './index.js';

describe('findSensitiveTerms', () => {
  it('matches a Simplified lexicon entry inside Traditional copy', () => {
    expect(findSensitiveTerms('這是穩賺不賠的機會')).toEqual([
      { term: '稳赚不赔', category: 'finance' },
    ]);
  });

  it('matches across the Taiwan phrase set, not just character variants', () => {
    expect(findSensitiveTerms('請用翻牆軟體觀看')).toEqual([
      { term: '翻墙软件', category: 'political' },
    ]);
  });

  it('normalizes full-width digits and symbols before matching', () => {
    expect(findSensitiveTerms('１００％安全的方案')).toEqual([
      { term: '100%安全', category: 'ad_law' },
    ]);
  });

  it('reports only the most specific hit when terms overlap', () => {
    expect(findSensitiveTerms('全網第一的穩賺不賠標的')).toEqual([
      { term: '全网第一', category: 'ad_law' },
      { term: '稳赚不赔', category: 'finance' },
    ]);
  });

  // Precision pin. The gate fails copy generation outright, so this feed's own
  // subject matter must never trip it; suppressing a weak topic is the
  // learner's job, not the lexicon's.
  it('leaves ordinary market coverage of its own topics alone', () => {
    expect(
      findSensitiveTerms(
        '穩定幣支付的結算行為正在改變：這集整理了美聯儲政策、以太坊流動性與比特幣礦工的 GPU 需求，' +
          '並比較兩個協議的年化收益率與槓桿風險。全球最大的交易所本季創下歷史最高交易量，' +
          '分析師認為這更像龐氏騙局的反面教材，而非超額收益的來源。',
      ),
    ).toEqual([]);
  });

  // Why two-character fragments stay out of the lists: matching is a substring
  // scan, so 保本 would fire on any sentence containing 確保本…
  it('does not fire on a sentence that merely spans a short term', () => {
    expect(findSensitiveTerms('為了確保本次升級順利')).toEqual([]);
  });
});

describe('describeSensitiveMatches', () => {
  it('quotes the term in the script the copy is written in and forbids evasion', () => {
    const message = describeSensitiveMatches(
      findSensitiveTerms('加我微信帶單，財富自由'),
    );
    expect(message).toContain('financial solicitation "加我微信"');
    expect(message).toContain('financial solicitation "財富自由"');
    expect(message).toContain('never evade review with homophones');
  });
});

describe('assertRednoteCopySafe', () => {
  it('passes compliant composed copy', () => {
    expect(() =>
      assertRednoteCopySafe(
        '支付結算的真實成本\n\n這集拆解了跨境清算路徑。\n支付產業',
      ),
    ).not.toThrow();
  });

  it('throws before publishing when any part of the composition matches', () => {
    expect(() =>
      assertRednoteCopySafe('支付結算的真實成本\n\n這集拆解了路徑。\n穩賺不賠'),
    ).toThrow(/moderation-risk wording .*穩賺不賠/);
  });
});

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

  // R1, verbatim from the note that was lost (social_posts 4b544a1f). The
  // allocation is attributed to a named investor and was removed anyway --
  // quoting someone does not turn direction into reporting.
  it('catches an allocation instruction carried by a quote', () => {
    expect(
      findSensitiveTerms(
        '他也指出全球多數經濟體都有類似債務問題，因此他偏好多重資產、跨國分散，' +
          '低配債券，超配黃金和少量比特幣這類非政府發行的資產。',
      ),
    ).toEqual([
      { term: '低配', category: 'asset_allocation' },
      { term: '超配', category: 'asset_allocation' },
    ]);
  });

  // R2, verbatim from social_posts 7159371f. It names no price and no asset to
  // buy, and the note still ended at zero views.
  it('catches entry and exit timing wording', () => {
    expect(
      findSensitiveTerms(
        '當《清晰法案》真的過關，可能不是利多，而是早早就定位的人準備撤場的訊號。' +
          '與其追問牛市怎麼進場，不如想想退場節奏該怎麼設。',
      ),
    ).toEqual([
      { term: '退场节奏', category: 'market_timing' },
      { term: '撤场', category: 'market_timing' },
    ]);
  });

  // The pin that keeps this gate from becoming a topic blacklist. This note
  // (social_posts a9cc1d05) also ended at zero views, but it breaks none of the
  // rules -- AI, agents and workplace coverage must stay publishable, and its
  // 「AI滲透率接近100%」 must not collide with the ad-law 100% entries.
  it('leaves an AI and workplace note untouched', () => {
    expect(
      findSensitiveTerms(
        '一家不到40人的公司，AI滲透率接近100%，財務、法務、HR、商務全部用Agent，' +
          '結果不是辦公室越換越小，反而是人變多、又要搬家。' +
          '他主張「薄中臺、厚一線」，讓離問題最近的人自己用AI解決。',
      ),
    ).toEqual([]);
  });

  // Precision pin for the R1/R2 lists specifically. 加碼 is how this feed
  // reports central-bank and fiscal moves, and 建倉/平倉/增持/減持 are the neutral
  // mechanics an explainer has to name -- none of them is direction to a reader.
  it('leaves macro reporting and market mechanics alone', () => {
    expect(
      findSensitiveTerms(
        '央行加碼寬鬆、政府加碼補助之後，這集說明永續合約的建倉與平倉機制，' +
          '以及機構本季對該資產的增持與減持。',
      ),
    ).toEqual([]);
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

  it('throws on an allocation instruction the composition introduced', () => {
    expect(() =>
      assertRednoteCopySafe('黃金的角色\n\n他主張超配黃金。\n宏觀經濟'),
    ).toThrow(/asset-allocation instruction "超配"/);
  });
});

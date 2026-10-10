import { describe, expect, it } from 'vitest';

import { packagePodcastScript } from '../podcast-packaging.js';
import {
  buildMixedLanguagePlan,
  segmentMixedLanguageText,
} from './mixed-language-text.js';

const terms = (text: string) =>
  segmentMixedLanguageText(text).flatMap((s) =>
    s.kind === 'english' ? [s.term] : [],
  );

describe('mixed-language segmentation', () => {
  it.each([
    'weETH',
    'GPT-5',
    'Layer 2',
    'S&P 500',
    'OpenAI API',
    'DeFi',
    'sUSD',
    'EigenLayer',
    'ERC-20',
    'Node.js',
    'GPT-4.5',
    'ETH/BTC',
    'Series A',
    'Llama 3.1',
    'iPhone 16 Pro',
    'GPT 4o',
    'Llama 70B',
    'U.S. SEC',
  ])('keeps %s whole in Chinese and Japanese', (term) => {
    for (const text of [`介绍${term}的发展。`, `${term}について話します。`]) {
      expect(terms(text)).toEqual([term]);
      expect(
        segmentMixedLanguageText(text)
          .map((s) => s.text)
          .join(''),
      ).toBe(text);
    }
  });
  it.each([
    ['BTC 10 万美元', ['BTC']],
    ['BTC10万', ['BTC']],
    ['GPT-5月底', ['GPT-5']],
    ['GPT-5万美元', ['GPT-5']],
    ['GPT-4.5万', ['GPT-4.5']],
    ['Layer 2 网络', ['Layer 2']],
    ['S&P 500 年内', ['S&P 500']],
    ['APY 5%', ['APY']],
    ['A股 K 线 X 平台 Ｘ', []],
    ['5G 4K 3AC 2024年', []],
    ['Q3 L2', ['Q3 L2']],
    ['ＤｅＦｉ\t API', ['DeFi API']],
    ['AI-驱动', ['AI']],
    ['BTC 10 20 ETF', ['BTC 10', 'ETF']],
    ['BTC 1234', ['BTC']],
    ['BTC\nETF', ['BTC', 'ETF']],
    ['BTC10天', ['BTC10']],
    ['', []],
  ])('segments %s without losing text', (text, expected) => {
    expect(terms(text)).toEqual(expected);
    expect(
      segmentMixedLanguageText(text)
        .map((s) => s.text)
        .join(''),
    ).toBe(text);
  });
});

describe('mixed-language plan', () => {
  it.each([
    ['米SEC長官は', 'ja'],
    ['日銀ETF', 'ja'],
    ['BTC 2024 ETF 获批', 'zh-Hant'],
    ['没有英文。', 'zh-Hant'],
    ['日本語だけです。', 'ja'],
    ['X', 'ja'],
    ['', 'zh-Hant'],
  ] as const)('keeps %s on whole-text path', (text, language) => {
    expect(buildMixedLanguagePlan(text, language)).toBeNull();
  });
  it('absorbs unanchored fragments repeatedly while preserving valid terms', () => {
    expect(
      buildMixedLanguagePlan('米SEC長官はBTCを説明します。', 'ja'),
    ).toEqual([
      { kind: 'speech', text: '米SEC長官は', english: false },
      { kind: 'speech', text: 'BTC', english: true },
      { kind: 'speech', text: 'を説明します。', english: false },
    ]);
  });
  it('uses punctuation pauses and removes only leading seam characters after English', () => {
    expect(
      buildMixedLanguagePlan('（BTC），中文？ETF。\n（美元$5%）。', 'zh-Hant'),
    ).toEqual([
      { kind: 'speech', text: 'BTC', english: true },
      { kind: 'pause', ms: 100 },
      { kind: 'speech', text: '中文？', english: false },
      { kind: 'pause', ms: 280 },
      { kind: 'speech', text: 'ETF', english: true },
      { kind: 'pause', ms: 280 },
      { kind: 'speech', text: '美元$5%）。', english: false },
    ]);
  });
  it('does not synthesize punctuation or add outer pauses', () => {
    expect(buildMixedLanguagePlan('！BTC，ETF？', 'zh-Hant')).toEqual([
      { kind: 'speech', text: 'BTC', english: true },
      { kind: 'pause', ms: 100 },
      { kind: 'speech', text: 'ETF', english: true },
    ]);
    expect(buildMixedLanguagePlan('中文 (BTC) 中文', 'zh-Hant')).toEqual([
      { kind: 'speech', text: '中文 (', english: false },
      { kind: 'speech', text: 'BTC', english: true },
      { kind: 'speech', text: '中文', english: false },
    ]);
  });
  it('keeps fullwidth native punctuation and symbols', () => {
    expect(buildMixedLanguagePlan('中文：ＤｅＦｉ$中文', 'zh-Hant')).toEqual([
      { kind: 'speech', text: '中文：', english: false },
      { kind: 'pause', ms: 100 },
      { kind: 'speech', text: 'DeFi', english: true },
      { kind: 'speech', text: '$中文', english: false },
    ]);
  });
  it('plans the real packaged intro and outro', () => {
    const plan = buildMixedLanguagePlan(
      packagePodcastScript('中文正文。'),
      'zh-Hant',
    )!;
    expect(
      plan.flatMap((p) => (p.kind === 'speech' && p.english ? [p.text] : [])),
    ).toEqual([
      'Zap Podcast',
      'Your strategy',
      'your machine',
      'your wallet',
      'Zap Pilot',
      'Zap Pilot',
    ]);
    expect(plan[0]).toEqual(
      expect.objectContaining({ kind: 'speech', english: false }),
    );
    expect(plan.at(-1)).toEqual(
      expect.objectContaining({ kind: 'speech', english: false }),
    );
  });
});

it.each([
  ['EigenLayer 最近出现变化，EigenLayer 的 TVL 开始下降。', 'zh-Hant', 1],
  ['BTCについて説明します。', 'ja', 0],
] as const)('punctuation alone supplies pauses for %s', (text, lang, count) => {
  const plan = buildMixedLanguagePlan(text, lang)!;
  expect(plan.filter((part) => part.kind === 'pause')).toHaveLength(count);
  if (count)
    expect(plan.filter((part) => part.kind === 'pause')).toEqual([
      { kind: 'pause', ms: 100 },
    ]);
});

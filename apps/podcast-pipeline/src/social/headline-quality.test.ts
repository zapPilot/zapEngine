import { describe, expect, it } from 'vitest';

import {
  bigramJaccard,
  describeHeadlineQualityIssue,
  longestCommonRun,
  normalizeHeadline,
} from './headline-quality.js';

describe('normalizeHeadline', () => {
  it('folds Simplified and Traditional spellings of the same headline together', () => {
    expect(normalizeHeadline('輝達為何129億買HuggingFace')).toBe(
      normalizeHeadline('英伟达为何129亿买HuggingFace'),
    );
  });

  it('drops punctuation, spacing and case so re-punctuating is not a rewrite', () => {
    expect(normalizeHeadline('SOL 單月漲近 47%！機構是關鍵買盤')).toBe(
      normalizeHeadline('sol單月漲近47%，機構是關鍵買盤'),
    );
  });
});

describe('bigramJaccard', () => {
  it('is 1 for identical text and 0 for disjoint text', () => {
    expect(bigramJaccard('abcd', 'abcd')).toBe(1);
    expect(bigramJaccard('abcd', 'wxyz')).toBe(0);
  });

  it('is 0 when either side is shorter than one bigram', () => {
    expect(bigramJaccard('a', 'abcd')).toBe(0);
    expect(bigramJaccard('', '')).toBe(0);
  });
});

describe('longestCommonRun', () => {
  it('measures the longest shared run, not total overlap', () => {
    expect(longestCommonRun('abcdefg', 'zzcdefzz')).toBe(4);
    expect(longestCommonRun('abcdef', 'badcfe')).toBe(1);
  });

  it('is 0 when either side is empty', () => {
    expect(longestCommonRun('', 'abc')).toBe(0);
  });
});

describe('describeHeadlineQualityIssue', () => {
  const publisherHeadline =
    '輝達斥資一百二十九億美元收購開源模型平台 HuggingFace，押注開發者生態';

  it('accepts a title that keeps the subject but rewrites the sentence', () => {
    expect(
      describeHeadlineQualityIssue({
        title: '輝達為何129億買HuggingFace',
        publisherHeadline,
      }),
    ).toBeUndefined();
  });

  it('rejects a title that lifts a run of the publisher headline', () => {
    const issue = describeHeadlineQualityIssue({
      title: '收購開源模型平台HuggingFace，押注開發者生態',
      publisherHeadline,
    });

    expect(issue).toMatch(/consecutive characters of the publisher headline/u);
  });

  it('rejects a synonym-swapped rewrite that keeps the clause order', () => {
    const issue = describeHeadlineQualityIssue({
      title: '輝達斥資129億美元收購HuggingFace',
      publisherHeadline: '輝達斥資129億美元收購HuggingFace',
    });

    expect(issue).toBeDefined();
  });

  it('reports overlap before concreteness so the writer gets one instruction', () => {
    const issue = describeHeadlineQualityIssue({
      title: '不容錯過的輝達收購案',
      publisherHeadline,
    });

    expect(issue).toMatch(/不容錯過/u);
  });

  it.each([
    '以太坊生態迎來新發展',
    '這個趨勢值得關注',
    '穩定幣監管深度解析',
    'What you need to know about stablecoins',
  ])('rejects the empty phrase in %s', (title) => {
    expect(describeHeadlineQualityIssue({ title })).toMatch(/empty phrase/u);
  });

  it('catches an empty phrase written in Simplified Chinese', () => {
    expect(
      describeHeadlineQualityIssue({ title: '以太坊生态迎来新发展' }),
    ).toMatch(/empty phrase/u);
  });

  it('leaves concreteness to the prose policy rather than rejecting a category noun', () => {
    // 輝達股票變成鏈上抵押品了 is the best-performing post in the published
    // corpus (245 views) and has no digit, no Latin script, and no character
    // in common with its source headline. A mechanical concreteness gate
    // rejects it, so there is no mechanical concreteness gate.
    expect(
      describeHeadlineQualityIssue({
        title: '輝達股票變成鏈上抵押品了',
        publisherHeadline: 'Coinbase 正式把美股搬上 Base',
      }),
    ).toBeUndefined();
    expect(
      describeHeadlineQualityIssue({
        title: '產業平台的新格局',
        publisherHeadline: 'Stripe buys Bridge for $1.1bn',
      }),
    ).toBeUndefined();
  });

  it('skips every publisher comparison when the episode has no source title', () => {
    // An episode scraped before `source_title` was recorded must not fail a
    // release; only the checks that stand on their own still apply.
    expect(
      describeHeadlineQualityIssue({ title: '產業平台的新格局' }),
    ).toBeUndefined();
    expect(
      describeHeadlineQualityIssue({
        title: '產業平台迎來新發展',
        publisherHeadline: undefined,
      }),
    ).toMatch(/empty phrase/u);
  });

  it('passes an empty title through untouched for the length rules to reject', () => {
    expect(describeHeadlineQualityIssue({ title: '   ' })).toBeUndefined();
  });
});

describe('shared named subjects are not plagiarism', () => {
  // Regression: an 11-character shared `HuggingFace` used to trip the run
  // ceiling on a correctly rewritten title, which at three attempts would
  // have failed the release rather than improved the title.
  it('does not count a shared Latin name or figure as lifted text', () => {
    expect(
      describeHeadlineQualityIssue({
        title: 'Anthropic估值被做成鏈上永續合約',
        publisherHeadline:
          'Traders build on-chain perpetual futures on Anthropic valuation',
      }),
    ).toBeUndefined();
    expect(
      describeHeadlineQualityIssue({
        title: '1.2億美元礦場被斷電',
        publisherHeadline:
          '1.2億美元的比特幣礦場因為一紙合約歧見遭電力公司斷電停擺',
      }),
    ).toBeUndefined();
  });
});

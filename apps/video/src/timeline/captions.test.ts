import { describe, expect, it } from 'vitest';

import {
  bridgeGaps,
  CAPTION_PROFILES,
  cueOffset,
  cueTextOf,
  MAX_CAPTION_CHARS,
  spanPhrases,
  SPLIT_RULES,
  splitPhrases,
  spokenLength,
} from './captions';
import { fullWidth, MAX_JA_CAPTION_UNITS } from './cjk';

const splitEnglish = CAPTION_PROFILES.en.split;
const splitJapanese = CAPTION_PROFILES.ja.split;

describe('English caption phrases', () => {
  it('keeps a sentence that fits as one phrase', () => {
    expect(
      splitEnglish('  Change an input, and the contract holds instead. '),
    ).toEqual(['Change an input, and the contract holds instead.']);
  });

  it('splits sentences on terminal punctuation but never inside a decimal', () => {
    expect(splitEnglish('It moved 13.75% of it. Then it held! Why?')).toEqual([
      'It moved 13.75% of it.',
      'Then it held!',
      'Why?',
    ]);
  });

  it('breaks long sentences at clauses, keeping dashes on the phrase they close', () => {
    expect(
      splitEnglish(
        'Zap Pilot put one production rule — the 200-day moving-average exit — in a public Vyper contract on Arbitrum Sepolia.',
      ),
    ).toEqual([
      'Zap Pilot put one production rule —',
      'the 200-day moving-average exit —',
      'in a public Vyper contract on Arbitrum Sepolia.',
    ]);
  });

  it('merges short clauses up to the limit', () => {
    const phrases = splitEnglish(
      'Then read-only calls return the decision: move BTC and ETH, 13.75% of the portfolio, to stablecoins — the same result as our Python backtest.',
    );
    expect(phrases).toEqual([
      'Then read-only calls return the decision: move BTC and ETH,',
      '13.75% of the portfolio, to stablecoins —',
      'the same result as our Python backtest.',
    ]);
    expect(phrases.every((phrase) => phrase.length <= MAX_CAPTION_CHARS)).toBe(
      true,
    );
  });

  it('packs an unbroken clause into balanced runs of words', () => {
    expect(
      splitPhrases(
        'one two three four five six seven eight nine ten',
        20,
        SPLIT_RULES.en,
      ),
    ).toEqual(['one two three four', 'five six seven eight', 'nine ten']);
  });

  it('keeps a single word longer than the limit intact', () => {
    expect(
      splitPhrases(
        '0x074A6d6497Af23158F946c7D571b1B627f3411Cd',
        10,
        SPLIT_RULES.en,
      ),
    ).toEqual(['0x074A6d6497Af23158F946c7D571b1B627f3411Cd']);
  });
});

describe('Japanese caption phrases', () => {
  it('keeps sentences that fit whole and splits between them', () => {
    expect(splitJapanese(' 予約はできますか？ はい、できます。 ')).toEqual([
      '予約はできますか？',
      'はい、できます。',
    ]);
  });

  it('breaks a long sentence at clauses, merging them up to the limit', () => {
    expect(
      splitPhrases(
        'あいう、えお、かきくけこ、さしすせそたちつてと。',
        10,
        SPLIT_RULES.ja,
      ),
    ).toEqual(['あいう、えお、', 'かきくけこ、', 'さしすせそ', 'たちつてと。']);
    const phrases = splitJapanese(
      '受付の待ち時間を、スマートフォンからkokode.localで確認できます。',
    );
    expect(phrases).toEqual([
      '受付の待ち時間を、',
      'スマートフォンからkokode.localで確認できます。',
    ]);
    expect(
      phrases.every((phrase) => fullWidth(phrase) <= MAX_JA_CAPTION_UNITS),
    ).toBe(true);
  });

  it('packs an unbroken clause into balanced runs without stranding the end', () => {
    expect(
      splitJapanese(
        'クリニックの受付業務を自動化するためのオールインワンソリューションをご紹介します',
      ),
    ).toEqual([
      'クリニックの受付業務を自動化するための',
      'オールインワンソリューションをご紹介します',
    ]);
    expect(
      splitPhrases(
        'ああああああああああいいいいいいいいいいううううう',
        10,
        SPLIT_RULES.ja,
      ),
    ).toEqual(['ああああああああ', 'ああいいいいいい', 'いいいいううううう']);
  });

  it('drops the space a line break lands on and keeps a long word intact', () => {
    expect(
      splitPhrases(
        'あいうえお ChatGPT かきくけこさしすせそ',
        10,
        SPLIT_RULES.ja,
      ),
    ).toEqual(['あいうえお ChatGPT', 'かきくけこさしすせそ']);
    expect(splitPhrases('kokode.local.example', 4, SPLIT_RULES.ja)).toEqual([
      'kokode.local.example',
    ]);
  });

  it('returns no phrases for a blank line', () => {
    expect(splitJapanese('  ')).toEqual([]);
  });
});

describe('CAPTION_PROFILES', () => {
  it('limits each language in its own units', () => {
    expect(CAPTION_PROFILES.en.maxUnits).toBe(MAX_CAPTION_CHARS);
    expect(CAPTION_PROFILES.ja.maxUnits).toBe(MAX_JA_CAPTION_UNITS);
    expect(CAPTION_PROFILES.en.weigh).toBe(spokenLength);
  });

  it('weighs Japanese by reading units plus a pause per clause and sentence mark', () => {
    expect(CAPTION_PROFILES.ja.weigh('はい、そうです。')).toBe(6 + 1 + 2);
    expect(CAPTION_PROFILES.ja.weigh('本当？!')).toBe(2 + 2 + 2);
    expect(CAPTION_PROFILES.ja.weigh('ab，c')).toBe(1.5 + 1);
  });
});

describe('cueTextOf', () => {
  const line = { id: 'l', text: '字幕', say: 'caption' };

  it('matches cues in the caption when it transcribes the narration', () => {
    expect(cueTextOf(line)).toBe('字幕');
    expect(cueTextOf(line, { lang: 'ja', relation: 'transcript' })).toBe(
      '字幕',
    );
  });

  it('matches cues in the narration when the caption translates it', () => {
    const translation = { lang: 'ja', relation: 'translation' } as const;
    expect(cueTextOf(line, translation)).toBe('caption');
    expect(cueTextOf({ id: 'l', text: 'same' }, translation)).toBe('same');
  });
});

describe('spokenLength', () => {
  it('weights digits, percent signs and pauses above letters', () => {
    expect(spokenLength('ab')).toBe(2);
    expect(spokenLength('7')).toBe(4);
    expect(spokenLength('%')).toBe(7);
    expect(spokenLength(',;:')).toBe(12);
    expect(spokenLength('.!?—')).toBe(24);
  });
});

describe('spanPhrases', () => {
  it('shares the duration by spoken length and ends exactly on time', () => {
    expect(spanPhrases(['aaaa', 'aaaaaaaaaaaa'], 100, 32)).toEqual([
      { from: 100, to: 108 },
      { from: 108, to: 132 },
    ]);
  });

  it('survives text with no spoken length', () => {
    expect(spanPhrases([''], 10, 5)).toEqual([{ from: 10, to: 10 }]);
  });

  it('shares by another weight when given one', () => {
    expect(spanPhrases(['あ', 'いいい'], 0, 40, (text) => text.length)).toEqual(
      [
        { from: 0, to: 10 },
        { from: 10, to: 40 },
      ],
    );
  });
});

describe('bridgeGaps', () => {
  it('extends a span to the next one across short pauses only', () => {
    expect(
      bridgeGaps(
        [
          { from: 0, to: 10, text: 'a' },
          { from: 14, to: 20, text: 'b' },
          { from: 60, to: 70, text: 'c' },
        ],
        5,
      ),
    ).toEqual([
      { from: 0, to: 14, text: 'a' },
      { from: 14, to: 20, text: 'b' },
      { from: 60, to: 70, text: 'c' },
    ]);
  });
});

describe('cueOffset', () => {
  it('places a cue proportionally to what is said before it', () => {
    expect(cueOffset('aaaa bbbb', 'bbbb', 90)).toBe(50);
    expect(cueOffset('Then it ran', 'Then', 90)).toBe(0);
  });

  it('throws when the cue is not in the line', () => {
    expect(() => cueOffset('Hold.', 'move', 30)).toThrow(
      'Cue "move" is not in the line "Hold."',
    );
  });
});

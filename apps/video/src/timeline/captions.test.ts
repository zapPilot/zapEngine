import { describe, expect, it } from 'vitest';

import {
  bridgeGaps,
  cueOffset,
  MAX_CAPTION_CHARS,
  spanPhrases,
  splitCaptionPhrases,
  spokenLength,
} from './captions';

describe('splitCaptionPhrases', () => {
  it('keeps a sentence that fits as one phrase', () => {
    expect(
      splitCaptionPhrases(
        '  Change an input, and the contract holds instead. ',
      ),
    ).toEqual(['Change an input, and the contract holds instead.']);
  });

  it('splits sentences on terminal punctuation but never inside a decimal', () => {
    expect(
      splitCaptionPhrases('It moved 13.75% of it. Then it held! Why?'),
    ).toEqual(['It moved 13.75% of it.', 'Then it held!', 'Why?']);
  });

  it('breaks long sentences at clauses, keeping dashes on the phrase they close', () => {
    expect(
      splitCaptionPhrases(
        'Zap Pilot put one production rule — the 200-day moving-average exit — in a public Vyper contract on Arbitrum Sepolia.',
      ),
    ).toEqual([
      'Zap Pilot put one production rule —',
      'the 200-day moving-average exit —',
      'in a public Vyper contract on Arbitrum Sepolia.',
    ]);
  });

  it('merges short clauses up to the limit', () => {
    const phrases = splitCaptionPhrases(
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
      splitCaptionPhrases(
        'one two three four five six seven eight nine ten',
        20,
      ),
    ).toEqual(['one two three four', 'five six seven eight', 'nine ten']);
  });

  it('keeps a single word longer than the limit intact', () => {
    expect(
      splitCaptionPhrases('0x074A6d6497Af23158F946c7D571b1B627f3411Cd', 10),
    ).toEqual(['0x074A6d6497Af23158F946c7D571b1B627f3411Cd']);
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

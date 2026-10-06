import { describe, expect, it } from 'vitest';

import {
  endsAtBreak,
  fullWidth,
  hasJapanese,
  JA_MAX_CPS,
  JA_TARGET_CPS,
  jaAtoms,
  jaClauses,
  jaSentences,
  MAX_JA_CAPTION_UNITS,
  MIN_CAPTION_SECONDS,
  readingUnits,
} from './cjk';

describe('caption limits', () => {
  it('reads comfortably below the hard limit', () => {
    expect(MAX_JA_CAPTION_UNITS).toBe(24);
    expect(JA_TARGET_CPS).toBeLessThan(JA_MAX_CPS);
    expect(MIN_CAPTION_SECONDS).toBe(1);
  });
});

describe('hasJapanese', () => {
  it('finds kana, kanji, Japanese punctuation and full-width forms', () => {
    for (const text of [
      'あ',
      'カ',
      'ｶ',
      '漢',
      '𠀋',
      '、',
      'Ａ',
      'kokode です',
    ]) {
      expect(hasJapanese(text), text).toBe(true);
    }
  });

  it('ignores Latin text and typographic punctuation', () => {
    expect(hasJapanese('kokode.local — Wi-Fi’s 30%')).toBe(false);
  });
});

describe('fullWidth', () => {
  it('counts ASCII and half-width kana as half a cell', () => {
    expect(fullWidth('abc')).toBe(1.5);
    expect(fullWidth('ｱｲｳ')).toBe(1.5);
    expect(fullWidth('あいう')).toBe(3);
    expect(fullWidth('ＡＢ')).toBe(2);
    expect(fullWidth('a あ')).toBe(2);
  });

  it('counts a character outside the BMP once', () => {
    expect(fullWidth('𠀋')).toBe(1);
  });
});

describe('readingUnits', () => {
  it('drops whitespace and Japanese punctuation', () => {
    expect(readingUnits('はい、そう。「ええ」！？…・')).toBe(6);
    expect(readingUnits('　あ（い）『う』，．')).toBe(3);
  });

  it('drops ASCII punctuation but reads Latin letters and digits', () => {
    expect(readingUnits('Wi-Fi で 30%')).toBe(4);
    expect(readingUnits('kokode.local!')).toBe(5.5);
  });
});

describe('jaSentences', () => {
  it('splits after sentence marks, keeping runs of marks and closing brackets', () => {
    expect(
      jaSentences(' 本当？！ はい。「そうです。」次です！ ok? yes! 終わり '),
    ).toEqual([
      '本当？！',
      'はい。',
      '「そうです。」',
      '次です！',
      'ok?',
      'yes!',
      '終わり',
    ]);
  });

  it('keeps a quote that runs on with と or って in its sentence', () => {
    expect(jaSentences('「何？」と聞く。「はい。」って言う。')).toEqual([
      '「何？」と聞く。',
      '「はい。」って言う。',
    ]);
  });

  it('returns nothing for blank text', () => {
    expect(jaSentences('  ')).toEqual([]);
  });
});

describe('jaClauses', () => {
  it('splits after 、 and ， with any closing bracket', () => {
    expect(jaClauses('はい、そうです，「ええ、」次に、 終わり')).toEqual([
      'はい、',
      'そうです，',
      '「ええ、」',
      '次に、',
      '終わり',
    ]);
  });

  it('keeps a quote that runs on with と in its clause', () => {
    expect(jaClauses('「ええ、」と言う、終わり')).toEqual([
      '「ええ、」と言う、',
      '終わり',
    ]);
  });

  it('never opens a clause with a mark', () => {
    expect(jaClauses('えっ、、本当')).toEqual(['えっ、、', '本当']);
  });
});

describe('jaAtoms', () => {
  it('keeps Latin words, numbers and katakana words whole', () => {
    expect(jaAtoms('kokode.localとWi-FiとChatGPTで30%、1,000円。')).toEqual([
      'kokode.local',
      'と',
      'Wi-Fi',
      'と',
      'ChatGPT',
      'で',
      '30%、',
      '1,000',
      '円。',
    ]);
    expect(jaAtoms('人々がコーヒーを飲む')).toEqual([
      '人々',
      'が',
      'コーヒー',
      'を',
      '飲',
      'む',
    ]);
  });

  it('never starts an atom with a small kana, ー or a closing mark', () => {
    expect(jaAtoms('ちょっと待って、ください。')).toEqual([
      'ちょっ',
      'と',
      '待っ',
      'て、',
      'く',
      'だ',
      'さ',
      'い。',
    ]);
    expect(jaAtoms('すごーーい！')).toEqual(['す', 'ごーー', 'い！']);
    expect(jaAtoms('スーパー・マーケット')).toEqual([
      'スーパー・',
      'マーケット',
    ]);
  });

  it('keeps opening brackets on the atom after them', () => {
    expect(jaAtoms('  「はい」と言った。 ')).toEqual([
      '「は',
      'い」',
      'と',
      '言っ',
      'た。',
    ]);
    expect(jaAtoms('「」')).toEqual(['「」']);
    expect(jaAtoms('終わり「')).toEqual(['終', 'わ', 'り', '「']);
  });

  it('carries spaces on the atom before them, so atoms rejoin to the text', () => {
    const text = 'ChatGPT のような AI が答えます。';
    expect(jaAtoms(text)).toEqual([
      'ChatGPT ',
      'の',
      'よ',
      'う',
      'な ',
      'AI ',
      'が',
      '答',
      'え',
      'ま',
      'す。',
    ]);
    expect(jaAtoms(text).join('')).toBe(text);
  });

  it('lets a leading mark open the first atom and returns nothing for blank text', () => {
    expect(jaAtoms('、から')).toEqual(['、', 'か', 'ら']);
    expect(jaAtoms('   ')).toEqual([]);
  });
});

describe('endsAtBreak', () => {
  it('accepts sentence and clause marks, optionally closed by a bracket', () => {
    for (const text of [
      'です。',
      'です。」  ',
      'ですが、',
      '本当？',
      '何！』',
      'really?',
      'go!',
    ]) {
      expect(endsAtBreak(text), text).toBe(true);
    }
  });

  it('rejects a phrase cut mid-clause', () => {
    for (const text of ['です', '「です', 'Hi.', '']) {
      expect(endsAtBreak(text), text).toBe(false);
    }
  });
});

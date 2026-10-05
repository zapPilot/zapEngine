export type MixedLanguageSegment =
  | { kind: 'native'; text: string }
  | { kind: 'english'; text: string; term: string };
export type MixedLanguagePart =
  | { kind: 'speech'; text: string; english: boolean }
  | { kind: 'pause'; ms: number };

const LETTER = '[A-Za-zÀ-ÖØ-öø-ɏＡ-Ｚａ-ｚ]';
const DIGIT = '[0-9０-９]';
const ALNUM = `[${LETTER.slice(1, -1)}${DIGIT.slice(1, -1)}]`;
const WORD = new RegExp(
  `(?:${LETTER}\\.){2,}|${LETTER}${ALNUM}*(?:[-'’&./+_]${ALNUM}+)*`,
  'y',
);
const NUM = new RegExp(`${DIGIT}{1,3}(?:[.．]${DIGIT}+)?${LETTER}*`, 'y');
const TOKEN_CHAR = new RegExp(ALNUM);
const ATTACHED_UNITS = [
  '十',
  '百',
  '千',
  '万',
  '萬',
  '亿',
  '億',
  '兆',
  '元',
  '円',
  '美元',
  '美金',
  '欧元',
  '歐元',
  '日元',
  '港元',
  'ドル',
  'ユーロ',
];
const UNITS = [
  ...ATTACHED_UNITS,
  '倍',
  '%',
  '％',
  '月',
  '个月',
  '個月',
  '小时',
  '小時',
  '分钟',
  '分鐘',
  '秒',
  '天',
  '次',
  '枚',
  'か月',
  'ヶ月',
  'カ月',
];
function startsWithUnit(text: string, units: string[]): boolean {
  return units.some((unit) => text.startsWith(unit));
}
const CONTENT = /[\p{L}\p{N}]/u;
const SENTENCE = /[。．.!！?？…\r\n]/u;
const CLAUSE = /[，,、；;：:・·—–~〜/-]/u;
const SEAM_CHARACTERS = new Set(
  '。．.!！?？…，,、；;：:・·—–~〜/-()（）[]【】「」『』{}',
);
function edgeSeam(text: string): string {
  let end = 0;
  while (
    end < text.length &&
    (/\s/u.test(text.charAt(end)) || SEAM_CHARACTERS.has(text.charAt(end)))
  )
    end += 1;
  return text.slice(0, end);
}
export const SEAM_RETAIN_S = 0.06;

const SENTENCE_PAUSE_MS = 280;
const CLAUSE_PAUSE_MS = 100;

function matchAt(pattern: RegExp, text: string, offset: number): string | null {
  pattern.lastIndex = offset;
  return pattern.exec(text)?.[0] ?? null;
}

function readWord(text: string, offset: number): string | null {
  const word = matchAt(WORD, text, offset);
  if (!word) return null;
  if (startsWithUnit(text.slice(offset + word.length), ATTACHED_UNITS)) {
    return word.replace(new RegExp(`(${LETTER})${DIGIT}+$`), '$1');
  }
  return word;
}

function spanEnd(text: string, offset: number, word: string): number {
  let end = offset + word.length;
  let previousWasNumber = false;
  while (true) {
    const space = /^[ \t\u00a0]+/.exec(text.slice(end));
    if (!space) return end;
    const next = end + space[0].length;
    const nextWord = readWord(text, next);
    if (nextWord) {
      end = next + nextWord.length;
      previousWasNumber = false;
      continue;
    }
    const number = previousWasNumber ? null : matchAt(NUM, text, next);
    if (
      !number ||
      TOKEN_CHAR.test(text.charAt(next + number.length)) ||
      startsWithUnit(text.slice(next + number.length).trimStart(), UNITS)
    )
      return end;
    end = next + number.length;
    previousWasNumber = true;
  }
}

export function segmentMixedLanguageText(text: string): MixedLanguageSegment[] {
  const segments: MixedLanguageSegment[] = [];
  let nativeStart = 0;
  let offset = 0;
  while (offset < text.length) {
    const word = TOKEN_CHAR.test(text.charAt(offset - 1))
      ? null
      : readWord(text, offset);
    if (!word) {
      offset += 1;
      continue;
    }
    const end = spanEnd(text, offset, word);
    const span = text.slice(offset, end);
    if (new RegExp(`^${LETTER}$`).test(span)) {
      offset = end;
      continue;
    }
    if (nativeStart < offset)
      segments.push({ kind: 'native', text: text.slice(nativeStart, offset) });
    segments.push({
      kind: 'english',
      text: span,
      term: span.normalize('NFKC').replace(/\s+/gu, ' '),
    });
    offset = end;
    nativeStart = end;
  }
  if (nativeStart < text.length)
    segments.push({ kind: 'native', text: text.slice(nativeStart) });
  return segments;
}

function anchorSegments(
  segments: MixedLanguageSegment[],
  languageCode: 'zh-Hant' | 'ja',
): MixedLanguageSegment[] {
  const anchor =
    languageCode === 'ja'
      ? /[\p{Script=Hiragana}\p{Script=Katakana}]/u
      : /\p{Script=Han}/u;
  while (true) {
    const index = segments.findIndex(
      (segment) =>
        segment.kind === 'native' &&
        CONTENT.test(segment.text) &&
        !anchor.test(segment.text),
    );
    if (index < 0) return segments;
    const start = Math.max(0, index - 1);
    const end = Math.min(segments.length, index + 2);
    if (end - start === 1) return segments;
    segments.splice(start, end - start, {
      kind: 'native',
      text: segments
        .slice(start, end)
        .map((segment) => segment.text)
        .join(''),
    });
    // Coalesce native neighbours after absorbing their shared English span.
    for (let i = segments.length - 1; i > 0; i -= 1) {
      if (
        segments[i]!.kind === 'native' &&
        segments[i - 1]!.kind === 'native'
      ) {
        segments[i - 1]!.text += segments[i]!.text;
        segments.splice(i, 1);
      }
    }
  }
}

function pauseMs(seam: string): number {
  if (SENTENCE.test(seam)) return SENTENCE_PAUSE_MS;
  return CLAUSE.test(seam) ? CLAUSE_PAUSE_MS : 0;
}

export function buildMixedLanguagePlan(
  text: string,
  languageCode: 'zh-Hant' | 'ja',
): MixedLanguagePart[] | null {
  const segments = anchorSegments(segmentMixedLanguageText(text), languageCode);
  if (!segments.some((segment) => segment.kind === 'english')) return null;
  const parts: MixedLanguagePart[] = [];
  let pendingPause = 0;
  for (const [index, segment] of segments.entries()) {
    const leading = edgeSeam(segment.text);
    const trailing = edgeSeam([...segment.text].reverse().join(''));
    pendingPause = Math.max(pendingPause, pauseMs(leading));
    const speech =
      segments[index - 1]?.kind === 'english'
        ? segment.text.slice(leading.length)
        : segment.text;
    if (CONTENT.test(speech)) {
      if (parts.length > 0 && pendingPause > 0)
        parts.push({ kind: 'pause', ms: pendingPause });
      parts.push({
        kind: 'speech',
        text: segment.kind === 'english' ? segment.term : speech,
        english: segment.kind === 'english',
      });
      pendingPause = pauseMs(trailing);
    } else {
      pendingPause = Math.max(pendingPause, pauseMs(segment.text));
    }
  }
  return parts;
}

export interface CanonicalSentence {
  id: string;
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

const HARD_SENTENCE_TERMINATORS = new Set([
  '。',
  '！',
  '？',
  '!',
  '?',
  '；',
  ';',
]);
const TRAILING_SENTENCE_CLOSERS = new Set([
  '」',
  '』',
  '”',
  '’',
  '）',
  ')',
  ']',
]);
const ENGLISH_ABBREVIATIONS = new Set([
  'dr',
  'jr',
  'mr',
  'mrs',
  'ms',
  'prof',
  'sr',
  'st',
  'vs',
]);

function precedingAsciiWord(script: string, index: number): string {
  let start = index;
  while (start > 0 && /[A-Za-z.]/.test(script[start - 1] ?? '')) {
    start -= 1;
  }
  return script.slice(start, index);
}

function isPeriodTerminator(script: string, index: number): boolean {
  const previous = script[index - 1] ?? '';
  const next = script[index + 1] ?? '';
  if (/\d/.test(previous) && /\d/.test(next)) return false;
  if (/[A-Z]/.test(previous) && /[A-Z]/.test(next)) return false;
  if (/[a-z\d]/i.test(previous) && /[a-z\d]/.test(next)) return false;
  if (/[a-z\d]/i.test(previous) && /[A-Z]/.test(next)) return true;
  if (next === '.') return false;

  const precedingToken = precedingAsciiWord(script, index);
  if (precedingToken) {
    const normalized = precedingToken.toLowerCase().replaceAll('.', '');
    if (ENGLISH_ABBREVIATIONS.has(normalized)) return false;
    if (/^(?:[A-Za-z]\.)+[A-Za-z]$/.test(precedingToken)) return false;
  }
  return true;
}

function isSentenceTerminator(script: string, index: number): boolean {
  const character = script[index] ?? '';
  if (HARD_SENTENCE_TERMINATORS.has(character)) return true;
  return character === '.' && isPeriodTerminator(script, index);
}

function pushSentence(
  script: string,
  sentences: CanonicalSentence[],
  rawStart: number,
  rawEnd: number,
): void {
  let startOffset = rawStart;
  let endOffset = rawEnd;
  while (startOffset < endOffset && /\s/u.test(script[startOffset] ?? '')) {
    startOffset += 1;
  }
  while (endOffset > startOffset && /\s/u.test(script[endOffset - 1] ?? '')) {
    endOffset -= 1;
  }
  if (endOffset <= startOffset) return;

  const index = sentences.length;
  sentences.push({
    id: `s${String(index + 1).padStart(4, '0')}`,
    index,
    text: script.slice(startOffset, endOffset),
    startOffset,
    endOffset,
  });
}

export function splitCanonicalSentences(script: string): CanonicalSentence[] {
  const sentences: CanonicalSentence[] = [];
  let sentenceStart = 0;
  let index = 0;

  while (index < script.length) {
    const character = script[index] ?? '';
    if (character === '\r' || character === '\n') {
      pushSentence(script, sentences, sentenceStart, index);
      index += character === '\r' && script[index + 1] === '\n' ? 2 : 1;
      sentenceStart = index;
      continue;
    }
    if (!isSentenceTerminator(script, index)) {
      index += 1;
      continue;
    }

    let sentenceEnd = index + 1;
    while (
      sentenceEnd < script.length &&
      (isSentenceTerminator(script, sentenceEnd) ||
        TRAILING_SENTENCE_CLOSERS.has(script[sentenceEnd] ?? ''))
    ) {
      sentenceEnd += 1;
    }
    pushSentence(script, sentences, sentenceStart, sentenceEnd);
    index = sentenceEnd;
    sentenceStart = sentenceEnd;
  }

  pushSentence(script, sentences, sentenceStart, script.length);

  return sentences;
}

export function canonicalSentenceRangeText(
  script: string,
  sentences: readonly CanonicalSentence[],
  startId: string,
  endId: string,
): string | null {
  const start = sentences.find((sentence) => sentence.id === startId);
  const end = sentences.find((sentence) => sentence.id === endId);
  if (!start || !end || end.index < start.index) return null;
  return script.slice(start.startOffset, end.endOffset);
}

export function formatSentencesForPrompt(
  sentences: readonly CanonicalSentence[],
): string {
  return sentences
    .map((sentence) => `${sentence.id}\t${sentence.text}`)
    .join('\n');
}

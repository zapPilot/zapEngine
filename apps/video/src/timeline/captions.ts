/** Longest caption phrase, in characters, that fits one 1080p caption line. */
export const MAX_CAPTION_CHARS = 60;

const SENTENCE_END = /(?<=[.!?])\s+/;
// A dash stays on the phrase it closes, so no caption opens with "—".
const CLAUSE_END = /(?<=[,:;—])\s+/;

function packWords(clause: string, maxChars: number): string[] {
  const words = clause.split(/\s+/);
  const chunks = Math.ceil(clause.length / maxChars);
  const target = clause.length / chunks;
  const phrases: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && (next.length > maxChars || current.length >= target)) {
      phrases.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  phrases.push(current);
  return phrases;
}

function mergeClauses(clauses: string[], maxChars: number): string[] {
  const merged: string[] = [];
  for (const clause of clauses) {
    const last = merged.at(-1);
    if (last !== undefined && `${last} ${clause}`.length <= maxChars) {
      merged[merged.length - 1] = `${last} ${clause}`;
    } else {
      merged.push(clause);
    }
  }
  return merged;
}

/**
 * Splits narration into caption phrases: whole sentences when they fit, then
 * clauses, then balanced runs of words. Decimal points ("13.75%") never split
 * because a sentence break needs whitespace after the punctuation.
 */
export function splitCaptionPhrases(
  text: string,
  maxChars = MAX_CAPTION_CHARS,
): string[] {
  return text
    .trim()
    .split(SENTENCE_END)
    .flatMap((sentence) =>
      sentence.length <= maxChars
        ? [sentence]
        : mergeClauses(sentence.split(CLAUSE_END), maxChars),
    )
    .flatMap((phrase) =>
      phrase.length <= maxChars ? [phrase] : packWords(phrase, maxChars),
    );
}

/**
 * Rough time a string takes to say, in letter-equivalents. Narration has no
 * word timestamps, so captions and cues are placed by this proxy: digits and
 * symbols are read out as words ("13.75%" is "thirteen point seven five
 * percent") and punctuation is a pause.
 */
export function spokenLength(text: string): number {
  let total = 0;
  for (const char of text) {
    if (/\d/.test(char)) total += 4;
    else if (char === '%') total += 7;
    else if (',;:'.includes(char)) total += 4;
    else if ('.!?—'.includes(char)) total += 6;
    else total += 1;
  }
  return total;
}

export type FrameSpan = { readonly from: number; readonly to: number };

/**
 * Shares `durationInFrames` between phrases by spoken length. Spans are
 * contiguous and end exactly at `from + durationInFrames`.
 */
export function spanPhrases(
  phrases: readonly string[],
  from: number,
  durationInFrames: number,
): FrameSpan[] {
  const total = Math.max(
    1,
    phrases.reduce((sum, phrase) => sum + spokenLength(phrase), 0),
  );
  let consumed = 0;
  return phrases.map((phrase) => {
    const start = from + Math.round((consumed / total) * durationInFrames);
    consumed += spokenLength(phrase);
    const end = from + Math.round((consumed / total) * durationInFrames);
    return { from: start, to: end };
  });
}

/**
 * Holds each caption until the next one when the pause between them is
 * shorter than `maxGap` frames, so captions do not blink between sentences.
 */
export function bridgeGaps<Span extends FrameSpan>(
  spans: readonly Span[],
  maxGap: number,
): Span[] {
  return spans.map((span, index) => {
    const next = spans[index + 1];
    return next !== undefined && next.from - span.to <= maxGap
      ? { ...span, to: next.from }
      : span;
  });
}

/**
 * Frame, relative to the line's own start, at which `marker` is spoken. Uses
 * the same estimate as the captions, so a visual keyed to a phrase lands with
 * its caption.
 */
export function cueOffset(
  text: string,
  marker: string,
  durationInFrames: number,
): number {
  const index = text.indexOf(marker);
  if (index < 0) {
    throw new Error(`Cue "${marker}" is not in the line "${text}".`);
  }
  return Math.round(
    (spokenLength(text.slice(0, index)) / spokenLength(text)) *
      durationInFrames,
  );
}

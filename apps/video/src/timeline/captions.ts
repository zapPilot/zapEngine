import {
  fullWidth,
  jaAtoms,
  jaClauses,
  jaSentences,
  MAX_JA_CAPTION_UNITS,
  readingUnits,
} from './cjk';
import type { CaptionSettings, VoLine } from './types';

/** Longest caption phrase, in characters, that fits one 1080p caption line. */
export const MAX_CAPTION_CHARS = 60;

/**
 * How one language cuts narration into caption phrases, coarsest first:
 * sentences, the clauses of a sentence, then balanced runs of the atoms a
 * clause may break between. `width` is what the phrase limit is measured in.
 */
export interface SplitRules {
  readonly sentences: (text: string) => string[];
  readonly clauses: (sentence: string) => string[];
  /** Cuts one clause wider than `max` into runs of atoms. */
  readonly pack: (clause: string, max: number) => string[];
  /** Rejoins two adjacent pieces of one sentence. */
  readonly join: (left: string, right: string) => string;
  readonly width: (text: string) => number;
}

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

/**
 * Japanese runs aim at an even share of what is left, so the last line is
 * never a stranded character: each line ends where it lands closest to that
 * share without passing `max`.
 */
function packAtoms(clause: string, max: number): string[] {
  let remaining = fullWidth(clause);
  let lines = Math.ceil(remaining / max);
  const phrases: string[] = [];
  let current = '';
  for (const atom of jaAtoms(clause)) {
    const next = current + atom;
    const target = remaining / lines;
    if (
      current !== '' &&
      (fullWidth(next) > max ||
        Math.abs(fullWidth(current) - target) <=
          Math.abs(fullWidth(next) - target))
    ) {
      // An atom carries the space after a Latin word.
      phrases.push(current.trimEnd());
      remaining -= fullWidth(current);
      lines = Math.max(1, lines - 1);
      current = atom;
    } else {
      current = next;
    }
  }
  phrases.push(current);
  return phrases;
}

export const SPLIT_RULES: {
  readonly en: SplitRules;
  readonly ja: SplitRules;
} = {
  // Decimal points ("13.75%") never split because a sentence break needs
  // whitespace after the punctuation.
  en: {
    sentences: (text) => text.split(SENTENCE_END),
    clauses: (sentence) => sentence.split(CLAUSE_END),
    pack: packWords,
    join: (left, right) => `${left} ${right}`,
    width: (text) => text.length,
  },
  // No spaces between words: pieces rejoin as written, measured in
  // full-width cells.
  ja: {
    sentences: jaSentences,
    clauses: jaClauses,
    pack: packAtoms,
    join: (left, right) => left + right,
    width: fullWidth,
  },
};

function mergeClauses(
  clauses: string[],
  max: number,
  rules: SplitRules,
): string[] {
  const merged: string[] = [];
  for (const clause of clauses) {
    const last = merged.at(-1);
    if (last !== undefined && rules.width(rules.join(last, clause)) <= max) {
      merged[merged.length - 1] = rules.join(last, clause);
    } else {
      merged.push(clause);
    }
  }
  return merged;
}

/**
 * Splits narration into caption phrases of at most `max` units: whole
 * sentences when they fit, then clauses (merged while they fit), then
 * balanced runs of atoms. One atom longer than `max` stays intact.
 */
export function splitPhrases(
  text: string,
  max: number,
  rules: SplitRules,
): string[] {
  return rules
    .sentences(text.trim())
    .flatMap((sentence) =>
      rules.width(sentence) <= max
        ? [sentence]
        : mergeClauses(rules.clauses(sentence), max, rules),
    )
    .flatMap((phrase) =>
      rules.width(phrase) <= max ? [phrase] : rules.pack(phrase, max),
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

/**
 * Reading time of a Japanese phrase, in characters: its `readingUnits` plus
 * the pauses its marks imply. A clause mark holds about as long as one
 * character takes to read, a sentence end twice that.
 */
function readingWeight(text: string): number {
  let pauses = 0;
  for (const char of text) {
    if ('、，'.includes(char)) pauses += 1;
    else if ('。！？!?'.includes(char)) pauses += 2;
  }
  return readingUnits(text) + pauses;
}

/** How one caption language is split into phrases and timed. */
export interface CaptionProfile {
  /** Phrase limit, in the units `split` measures. */
  readonly maxUnits: number;
  readonly split: (text: string) => string[];
  /** Share of a line's duration a phrase gets, relative to its siblings. */
  readonly weigh: (text: string) => number;
}

export const CAPTION_PROFILES: {
  readonly en: CaptionProfile;
  readonly ja: CaptionProfile;
} = {
  en: {
    maxUnits: MAX_CAPTION_CHARS,
    split: (text) => splitPhrases(text, MAX_CAPTION_CHARS, SPLIT_RULES.en),
    weigh: spokenLength,
  },
  ja: {
    maxUnits: MAX_JA_CAPTION_UNITS,
    split: (text) => splitPhrases(text, MAX_JA_CAPTION_UNITS, SPLIT_RULES.ja),
    weigh: readingWeight,
  },
};

/**
 * The sentence a cue phrase is looked up in: what the viewer hears. That is
 * the caption itself for a transcript and the narration for a translation.
 */
export function cueTextOf(line: VoLine, captions?: CaptionSettings): string {
  return captions?.relation === 'translation'
    ? (line.say ?? line.text)
    : line.text;
}

export interface FrameSpan {
  readonly from: number;
  readonly to: number;
}

/**
 * Shares `durationInFrames` between phrases by `weigh` (spoken length by
 * default). Spans are contiguous and end exactly at `from + durationInFrames`.
 */
export function spanPhrases(
  phrases: readonly string[],
  from: number,
  durationInFrames: number,
  weigh: (text: string) => number = spokenLength,
): FrameSpan[] {
  const total = Math.max(
    1,
    phrases.reduce((sum, phrase) => sum + weigh(phrase), 0),
  );
  let consumed = 0;
  return phrases.map((phrase) => {
    const start = from + Math.round((consumed / total) * durationInFrames);
    consumed += weigh(phrase);
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

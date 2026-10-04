/**
 * Measures and break points for Japanese captions. Japanese has no spaces, so
 * phrases are cut after sentence and clause marks and, failing that, between
 * characters: never before a small kana or a closing mark (行頭禁則), never
 * after an opening bracket (行末禁則) and never inside a Latin word.
 */

/** Longest Japanese caption phrase, in full-width units, that fits one 1080p line. */
export const MAX_JA_CAPTION_UNITS = 24;

/** Comfortable reading speed for Japanese captions, in `readingUnits` per second. */
export const JA_TARGET_CPS = 4;

/** Fastest a Japanese caption may ask the viewer to read. */
export const JA_MAX_CPS = 6;

/** Shortest time a caption may stay on screen. */
export const MIN_CAPTION_SECONDS = 1;

// Kana, CJK ideographs, CJK symbols and punctuation, full-width forms.
const JAPANESE =
  /[\u3000-\u303F\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u{20000}-\u{2FFFF}]/u;

// ASCII and half-width katakana take half a full-width cell.
const HALF_WIDTH = /[\p{ASCII}\uFF61-\uFF9F]/u;

// Read silently: whitespace, Japanese punctuation and ASCII punctuation.
const SILENT = /[\s、。，．！？「」『』（）・…!-/:-@[-`{-~]/gu;

const SENTENCE_MARKS = '。！？!?';
const CLAUSE_MARKS = '、，';
const CLOSING = '」』）';

// A quote that closes and goes on with と or って is part of a longer phrase:
// 「予約できますか？」と聞かれる.
const QUOTE_CLOSED = /[」』）]$/u;
const QUOTE_RUNS_ON = /^[とっ]$/u;

// A Latin word, number, domain or product name ("kokode.local", "Wi-Fi",
// "1,000"), a katakana word ("スマートフォン"), a whitespace run, else one
// character.
const TOKEN =
  /[\dA-Za-z０-９Ａ-Ｚａ-ｚ]+(?:[.,:/'’&+_@-][\dA-Za-z０-９Ａ-Ｚａ-ｚ]+)*|[ァ-ヺー]+|\s+|./gsu;

// 行頭禁則: a token opening with a small kana, a long-vowel or iteration
// mark, closing punctuation or whitespace stays on the atom before it.
const NO_LINE_START =
  /^[\sぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶーゝゞヽヾ々、。，．・…」』）！？：；%％!?),.:;]/u;

// 行末禁則: opening brackets stay on the atom after them.
const NO_LINE_END = /^[「『（(]$/u;

const BREAK_END = /[。！？、，!?][」』）]?$/u;

/** Whether `text` contains any kana, kanji or full-width character. */
export function hasJapanese(text: string): boolean {
  return JAPANESE.test(text);
}

/** Display width in full-width cells: ASCII and half-width kana count ½. */
export function fullWidth(text: string): number {
  let width = 0;
  for (const char of text) width += HALF_WIDTH.test(char) ? 0.5 : 1;
  return width;
}

/** `fullWidth` of what is actually read: whitespace and punctuation are free. */
export function readingUnits(text: string): number {
  return fullWidth(text.replace(SILENT, ''));
}

/**
 * Cuts `text` after every run of `marks` and the brackets that close it,
 * unless the quote runs on. Pieces are trimmed; empty ones are dropped.
 */
function cutAfter(text: string, marks: string): string[] {
  const pieces: string[] = [];
  let current = '';
  let ended = false;
  for (const char of text) {
    if (
      ended &&
      !marks.includes(char) &&
      !CLOSING.includes(char) &&
      !(QUOTE_CLOSED.test(current) && QUOTE_RUNS_ON.test(char))
    ) {
      pieces.push(current);
      current = '';
    }
    current += char;
    if (marks.includes(char)) ended = true;
    else if (!CLOSING.includes(char)) ended = false;
  }
  pieces.push(current);
  return pieces.map((piece) => piece.trim()).filter((piece) => piece !== '');
}

/**
 * Sentences, each keeping its 。！？ and any bracket that closes it. A quote
 * followed by と or って belongs to the sentence that goes on after it.
 */
export function jaSentences(text: string): string[] {
  return cutAfter(text, SENTENCE_MARKS);
}

/** Clauses of one sentence, each keeping its 、 or ， (quotes as above). */
export function jaClauses(sentence: string): string[] {
  return cutAfter(sentence, CLAUSE_MARKS);
}

/**
 * Units a caption line may break between. Joined, they give back the trimmed
 * text, including any spaces around Latin words.
 */
export function jaAtoms(text: string): string[] {
  const atoms: string[] = [];
  let opening = '';
  for (const token of text.trim().match(TOKEN) ?? []) {
    const last = atoms.at(-1);
    if (NO_LINE_END.test(token)) {
      opening += token;
    } else if (
      last !== undefined &&
      opening === '' &&
      NO_LINE_START.test(token)
    ) {
      atoms[atoms.length - 1] = last + token;
    } else {
      atoms.push(opening + token);
      opening = '';
    }
  }
  if (opening !== '') atoms.push(opening);
  return atoms;
}

/** Whether `text` ends at a sentence or clause mark, so a phrase may end there. */
export function endsAtBreak(text: string): boolean {
  return BREAK_END.test(text.trimEnd());
}

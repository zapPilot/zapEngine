import { fullWidth, hasJapanese } from '../timeline/cjk';

/**
 * How kinetic type splits a line: Japanese and Chinese arrive a character at
 * a time; Latin splits on spaces, each word keeping its space.
 */
export function pieces(text: string): string[] {
  if (hasJapanese(text)) return Array.from(text);
  const words = text.split(' ');
  return words.map((word, i) => (i < words.length - 1 ? `${word} ` : word));
}

/** Average advance of a half-width glyph in a heavy sans, in em per half cell. */
const LATIN_EM = 1.16;

/**
 * The largest font size, up to `max`, at which the widest of `lines` fits
 * `width` px: full-width glyphs advance about 1em, Latin about 0.58em.
 */
export function fitFontSize(
  lines: readonly string[],
  width: number,
  max: number,
): number {
  const ems = Math.max(
    ...lines.map(
      (line) => fullWidth(line) * (hasJapanese(line) ? 1 : LATIN_EM),
    ),
  );
  return Math.min(max, Math.floor(width / Math.max(ems, 1)));
}

/**
 * Typewriter text. One code point appears every `framesPerChar` frames after
 * `from` (the k-th at `from + k * framesPerChar`), so surrogate pairs and
 * multi-byte scripts never show half a character.
 */
export function typedText(
  text: string,
  frame: number,
  from: number,
  framesPerChar: number,
): string {
  const chars = Array.from(text);
  const shown = Math.floor((frame - from) / framesPerChar);
  return chars.slice(0, Math.min(Math.max(shown, 0), chars.length)).join('');
}

/** Frame at which `typedText` first shows all of `text`. */
export function typingEnd(
  text: string,
  from: number,
  framesPerChar: number,
): number {
  return from + Array.from(text).length * framesPerChar;
}

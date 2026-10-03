const DIGITS = '0123456789';
const HEX = '0123456789abcdef';

/** Cheap integer hash; deterministic so every render of a frame matches. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return (h ^ (h >>> 15)) >>> 0;
}

function glyphFor(char: string, seed: number, index: number): string {
  const pool = /\d/.test(char) ? DIGITS : /[a-f]/i.test(char) ? HEX : null;
  if (pool === null) return char;
  const glyph = pool[hash(seed, index) % pool.length] as string;
  return char === char.toUpperCase() ? glyph.toUpperCase() : glyph;
}

/** How many leading characters of `target` read correctly at `progress`. */
export function settledLength(target: string, progress: number): number {
  const settled = Math.floor(
    Math.min(Math.max(progress, 0), 1) * target.length,
  );
  // A hex prefix is part of the shape, not the value.
  return Math.max(settled, target.startsWith('0x') ? 2 : 0);
}

/**
 * Text that settles left to right: at `progress` 0 every digit/hex character
 * is noise, at 1 it reads `target`. Separators (".", ",", "x", "…", spaces)
 * never scramble, so the number keeps its shape while it resolves.
 * `seed` changes the noise; pass the frame to make it flicker.
 */
export function scrambleText(
  target: string,
  progress: number,
  seed: number,
): string {
  const fixed = settledLength(target, progress);
  return Array.from(target, (char, index) =>
    index < fixed ? char : glyphFor(char, seed, index),
  ).join('');
}

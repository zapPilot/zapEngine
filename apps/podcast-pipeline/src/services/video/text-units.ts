// Width heuristic shared by subtitle wrapping and headline layout: CJK glyphs
// occupy one unit, Latin glyphs roughly half, matching the burned-in fonts.
export function characterUnits(character: string): number {
  return (character.codePointAt(0) ?? 0) <= 0xff ? 0.55 : 1;
}

export function lineUnits(text: string): number {
  return Array.from(text).reduce(
    (total, character) => total + characterUnits(character),
    0,
  );
}

export function speakingUnits(value: string): number {
  const latinWords = value.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  const nonLatin = Array.from(value.replace(/[A-Za-z0-9\s]/g, '')).length;
  return Math.max(1, nonLatin + latinWords * 1.4);
}

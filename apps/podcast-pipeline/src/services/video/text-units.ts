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

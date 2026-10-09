export const X_TOTAL_MAX_WEIGHTED_LENGTH = 280;
const X_URL_WEIGHT = 23;
const URL_PATTERN = /https?:\/\/[^\s]+/giu;

export function weightedTweetLength(value: string): number {
  let length = 0;
  let previousEnd = 0;

  for (const match of value.matchAll(URL_PATTERN)) {
    length += weightedCharacterLength(value.slice(previousEnd, match.index));
    length += X_URL_WEIGHT;
    previousEnd = match.index + match[0].length;
  }

  return length + weightedCharacterLength(value.slice(previousEnd));
}

function weightedCharacterLength(value: string): number {
  return Array.from(value).reduce(
    (length, character) => length + (isCjkCharacter(character) ? 2 : 1),
    0,
  );
}

function isCjkCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0)!;
  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
    (codePoint >= 0x2e80 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xa960 && codePoint <= 0xa97f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef) ||
    (codePoint >= 0x20000 && codePoint <= 0x323af)
  );
}

export function trimTweetTextToWeightedLength(
  value: string,
  maximum: number,
): string {
  const trimmed = value.trim();
  if (weightedTweetLength(trimmed) <= maximum) return trimmed;

  let length = 0;
  const output: string[] = [];
  for (const character of Array.from(trimmed)) {
    const characterLength = weightedCharacterLength(character);
    if (length + characterLength > maximum) break;
    output.push(character);
    length += characterLength;
  }
  return output.join('').trimEnd();
}

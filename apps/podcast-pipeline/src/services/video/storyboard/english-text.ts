export const NON_LATIN_SCRIPT_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function normalizedEntityText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function containsEntityPhrase(corpus: string, entity: string): boolean {
  const normalizedCorpus = ` ${normalizedEntityText(corpus)} `;
  const normalizedEntity = normalizedEntityText(entity);
  return Boolean(
    normalizedEntity && normalizedCorpus.includes(` ${normalizedEntity} `),
  );
}

export function isEnglishOnly(value: string): boolean {
  return !NON_LATIN_SCRIPT_PATTERN.test(value);
}

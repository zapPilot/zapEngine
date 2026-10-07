import { containsEntityPhrase } from './storyboard/english-text.js';

const SEARCH_RANKING_NOISE_WORDS = new Set([
  'adult',
  'and',
  'at',
  'documentary',
  'editorial',
  'in',
  'office',
  'photo',
  'photograph',
  'real',
  'the',
  'using',
  'with',
  'working',
  'world',
]);

export function normalizedSearchTokens(intent: string): string[] {
  return [
    ...new Set(
      (
        intent
          .normalize('NFKC')
          .toLowerCase()
          .match(/[\p{L}\p{N}]{2,}/gu) ?? []
      ).filter((token) => !SEARCH_RANKING_NOISE_WORDS.has(token)),
    ),
  ];
}

export const SEARCH_SHAPING_TERMS = [
  'photo',
  'photos',
  'photograph',
  'image',
  'images',
  'picture',
  'pictures',
  'stock',
  'footage',
  'b-roll',
  'editorial',
  'documentary',
  'real world',
  'illustration',
  'render',
  'wallpaper',
  'logo',
  'headshot',
  'portrait',
  'people',
  'team',
  'staff',
  'workers',
  'engineers',
  'developers',
  'scientists',
  'researchers',
  'founders',
  'traders',
  'professionals',
  'officials',
  'customers',
  'executives',
  'working',
  'monitoring',
  'collaborating',
  'meeting',
  'conducting',
  'restoring',
  'verifying',
  'using',
  'office',
  'laboratory',
  'lab',
  'desk',
  'screens',
  'headquarters',
  'building',
  'exterior',
  'interior',
  'scene',
  'concept',
] as const;

export function containsShapingTerm(
  text: string,
  exemptNames: readonly string[] = [],
): boolean {
  let remainder = text.normalize('NFKC').toLowerCase();
  for (const name of [...exemptNames].sort((a, b) => b.length - a.length)) {
    if (!containsEntityPhrase(remainder, name)) continue;
    const escaped = name
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    remainder = remainder.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu'),
      ' ',
    );
  }
  return SEARCH_SHAPING_TERMS.some((term) =>
    containsEntityPhrase(remainder, term),
  );
}

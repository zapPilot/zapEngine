import { isPlainRecord } from '../lib/typeGuards.js';

export type TitleVariants = Record<
  string,
  { title: string; method: 'llm' | 'truncate' }
>;

const DANGLING_TITLE_TAIL = /[\s，、：；,:;—–\-·「『“‘《〈（([]$/u;
const titleSegmenter = new Intl.Segmenter('zh', { granularity: 'word' });

export function fitTitleToBudget(title: string, maxCharacters: number): string {
  const normalized = title.trim();
  if (Array.from(normalized).length <= maxCharacters) return normalized;

  let fitted = '';
  let length = 0;
  let clauseEnd = 0;
  let hasHan = false;
  for (const { segment, isWordLike } of titleSegmenter.segment(normalized)) {
    const segmentLength = Array.from(segment).length;
    if (length + segmentLength > maxCharacters) break;
    for (const character of segment) {
      if (
        !isWordLike &&
        (/[，、；,;]/u.test(character) ||
          (hasHan && /[:：\s]/u.test(character))) &&
        length >= maxCharacters * 0.6
      ) {
        clauseEnd = fitted.length;
      }
      fitted += character;
      length += 1;
      hasHan ||= /\p{Script=Han}/u.test(character);
      if (
        !isWordLike &&
        /[！？。!?]/u.test(character) &&
        length >= maxCharacters * 0.6
      ) {
        clauseEnd = fitted.length;
      }
    }
  }
  const characters = Array.from(
    clauseEnd ? fitted.slice(0, clauseEnd) : fitted,
  );
  while (characters.length && DANGLING_TITLE_TAIL.test(characters.at(-1)!)) {
    characters.pop();
  }
  return characters.length
    ? characters.join('')
    : Array.from(normalized).slice(0, maxCharacters).join('').trimEnd();
}

export function readTitleVariant(raw: unknown, budget: number): string | null {
  if (!isPlainRecord(raw)) return null;
  const variant = raw[String(budget)];
  if (
    !isPlainRecord(variant) ||
    typeof variant['title'] !== 'string' ||
    (variant['method'] !== 'llm' && variant['method'] !== 'truncate')
  )
    return null;
  const title = variant['title'].trim();
  return title && !/[\r\n]/u.test(title) && [...title].length <= budget
    ? title
    : null;
}

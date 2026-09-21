import { convertTextToZhCN } from '../services/opencc.js';

/**
 * Executable half of `prompts/social/headline.md`. The prose tells the writer
 * what a good title does; these checks reject the two failures prose has not
 * stopped on its own — a title that is the publisher's headline with words
 * swapped, and a title made of filler. Both run inside `copy.ts`'s existing
 * three-attempt loop, so a rejection is a rewrite request, not a release
 * failure.
 */

/**
 * Half the character bigrams shared. Two sentences that say the same thing in
 * genuinely different words land far below this; a synonym-swapped rewrite of
 * the same clause order lands above it. Deliberately loose — the cost of a
 * false rejection is a wasted generation attempt, and at three attempts a
 * tight threshold would start failing releases.
 */
const MAX_PUBLISHER_BIGRAM_JACCARD = 0.5;

/**
 * A run this long is lifted, not written. Short enough to catch a copied
 * clause, long enough that a shared named subject (輝達, HuggingFace) or a
 * shared figure never trips it.
 */
const MAX_PUBLISHER_COMMON_RUN = 8;

/**
 * There is deliberately no executable concreteness check here, and re-adding
 * one is a regression. "Every title carries a proper noun or a number" is a
 * real rule and it stays in the prose policy, but a Chinese proper noun has no
 * orthographic marker: 輝達 and 車企 are indistinguishable to a matcher, and
 * neither shares characters with a source headline that named the company in
 * Latin script. Measured against the 66 published Rednote titles, a
 * digit-or-Latin-or-source-overlap proxy rejected five, including
 * 輝達股票變成鏈上抵押品了 -- the single best-performing post in the corpus at
 * 245 views. A gate that rejects the best title is worse than no gate.
 */

/**
 * Stands in for one Latin-or-digit token while measuring reuse. The policy
 * *requires* keeping the publisher's named subjects and figures, so a shared
 * `HuggingFace` is compliance, not plagiarism — left unmasked it is eleven
 * identical characters and trips the run ceiling on a correct title. Masking
 * measures the sentence the writer actually wrote around the name.
 */
const NAMED_TOKEN_SENTINEL = '\u0000';
const NAMED_TOKEN_PATTERN = /[a-z0-9０-９]+/gu;

/**
 * Phrases that occupy the space a fact should hold. Matched after the same
 * normalization as everything else, so a Simplified spelling is caught by its
 * Traditional entry and vice versa.
 */
const GENERIC_HEADLINE_PHRASES = [
  '迎來新發展',
  '值得關注',
  '深度解析',
  '全面解讀',
  '帶來新機遇',
  '一文看懂',
  '你需要知道的',
  '不容錯過',
  '最新動態',
  '引發熱議',
  'what you need to know',
  'everything you need to know',
  'a deep dive',
  'here is why it matters',
] as const;

/**
 * OpenCC first so a Simplified answer compares equal to its Traditional form,
 * then strip everything that carries no meaning. Punctuation removal matters:
 * a rewrite that only re-punctuates the publisher's sentence must not read as
 * a different title.
 */
export function normalizeHeadline(value: string): string {
  return convertTextToZhCN(value)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

function maskNamedTokens(value: string): string {
  return value.replace(NAMED_TOKEN_PATTERN, NAMED_TOKEN_SENTINEL);
}

function bigrams(value: string): Set<string> {
  const characters = Array.from(value);
  const result = new Set<string>();
  for (let index = 0; index + 1 < characters.length; index += 1) {
    result.add(`${characters[index]}${characters[index + 1]}`);
  }
  return result;
}

/** Character-bigram Jaccard over normalized text; 0 when either side is too short. */
export function bigramJaccard(left: string, right: string): number {
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Length of the longest run of characters present in both normalized strings. */
export function longestCommonRun(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  if (a.length === 0 || b.length === 0) return 0;

  // Rolling single row: only the previous row is ever read, and these are
  // headlines, so the quadratic walk is free.
  let previous = new Array<number>(b.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] !== b[j - 1]) continue;
      current[j] = previous[j - 1]! + 1;
      if (current[j]! > best) best = current[j]!;
    }
    previous = current;
  }
  return best;
}

/**
 * Why this title is not publishable, or `undefined`. One reason at a time:
 * the message becomes the next attempt's instruction, and a list of
 * simultaneous complaints is what makes a rewrite oscillate.
 *
 * `publisherHeadline` is optional because it is: an episode scraped before
 * `source_title` was recorded has none, and the similarity checks are skipped
 * rather than approximated. Skipping is the safe direction — the prose policy
 * still applies, and a missing headline must not fail a release.
 */
export function describeHeadlineQualityIssue(input: {
  title: string;
  publisherHeadline?: string;
}): string | undefined {
  const title = normalizeHeadline(input.title);
  if (!title) return undefined;

  const generic = GENERIC_HEADLINE_PHRASES.find((phrase) =>
    title.includes(normalizeHeadline(phrase)),
  );
  if (generic) {
    return `Title contains the empty phrase "${generic}". Replace it with the specific finding — a named subject or a number the reader can repeat.`;
  }

  const publisher = normalizeHeadline(input.publisherHeadline ?? '');
  if (!publisher) return undefined;

  // Reuse is measured with names masked; subject retention is measured
  // without, because a shared name is the one overlap the policy asks for.
  const maskedTitle = maskNamedTokens(title);
  const maskedPublisher = maskNamedTokens(publisher);

  const run = longestCommonRun(maskedTitle, maskedPublisher);
  if (run >= MAX_PUBLISHER_COMMON_RUN) {
    return `Title reuses ${run} consecutive characters of the publisher headline. Keep the named subject, then write the sentence from the finding instead of editing the publisher's wording.`;
  }

  const jaccard = bigramJaccard(maskedTitle, maskedPublisher);
  if (jaccard >= MAX_PUBLISHER_BIGRAM_JACCARD) {
    return `Title is ${Math.round(jaccard * 100)}% character-overlapping with the publisher headline, which is a synonym-swapped rewrite rather than a new title. Keep the named subject and restate the finding in a different construction.`;
  }

  return undefined;
}

import { convertTextToZhCN, convertTextToZhTW } from '../../services/opencc.js';
import { AD_LAW_TERMS } from './ad-law.js';
import { ASSET_ALLOCATION_TERMS } from './asset-allocation.js';
import { FINANCE_TERMS } from './finance.js';
import { MARKET_TIMING_TERMS } from './market-timing.js';
import { POLITICAL_TERMS } from './political.js';

/**
 * Rednote moderation gate. Rednote silently zeroes a post it rejects — the note
 * disappears from the manager and its metrics stay at zero — so wording that
 * fails review costs a whole episode's reach with no error to react to.
 *
 * Precision discipline for anyone extending these lists:
 *
 * - Never add a term this feed is *about*. 穩定幣、比特幣、以太坊、美聯儲、
 *   流動性、GPU are the subject matter; suppressing a topic that underperforms is
 *   the learner's job (`review_status` de-pollution in ./../strategy.ts), not
 *   this gate's.
 * - Prefer terms of three characters or more. Matching is a substring scan, so a
 *   two-character fragment collides with ordinary sentences (保本 inside
 *   「確保本次」). ./asset-allocation.ts and ./market-timing.ts each carry a
 *   handful of deliberate two-character exceptions and say why in place.
 * - Only grow the lists from real review feedback. A false positive fails copy
 *   generation outright, which is more expensive than one risky post.
 *
 * These lists are the precision half of the gate. They catch wording that can
 * only be an instruction; the framing a term list cannot express — political
 * motive presented as market causation, a prediction stated more strongly than
 * its source — is judged by ../rednote-semantic-risk.ts instead. Neither layer
 * is a topic blacklist.
 */
export type SensitiveCategory =
  | 'ad_law'
  | 'finance'
  | 'asset_allocation'
  | 'market_timing'
  | 'political';

export interface SensitiveMatch {
  term: string;
  category: SensitiveCategory;
}

const CATEGORY_LABELS: Record<SensitiveCategory, string> = {
  ad_law: 'ad-law absolute claim',
  finance: 'financial solicitation',
  asset_allocation: 'asset-allocation instruction',
  market_timing: 'entry-exit timing instruction',
  political: 'political sensitivity',
};

// Matching is script- and width-insensitive: the lists are authored in the
// Mainland vocabulary Rednote reviews against, while published copy is
// Traditional, so both sides run through the same normalization.
function normalize(value: string): string {
  return convertTextToZhCN(value).normalize('NFKC').toLowerCase();
}

// ~270 short terms against a post of at most a few hundred characters: a
// normalized substring scan costs microseconds, so an Aho-Corasick dependency
// (mint-filter, houbb/sensitive-word) would buy nothing but a build surface.
const INDEX: readonly { normalized: string; match: SensitiveMatch }[] = [
  ...indexTerms(AD_LAW_TERMS, 'ad_law'),
  ...indexTerms(FINANCE_TERMS, 'finance'),
  ...indexTerms(ASSET_ALLOCATION_TERMS, 'asset_allocation'),
  ...indexTerms(MARKET_TIMING_TERMS, 'market_timing'),
  ...indexTerms(POLITICAL_TERMS, 'political'),
];

function indexTerms(
  terms: readonly string[],
  category: SensitiveCategory,
): { normalized: string; match: SensitiveMatch }[] {
  return terms.map((term) => ({
    normalized: normalize(term),
    match: { term, category },
  }));
}

export function findSensitiveTerms(text: string): SensitiveMatch[] {
  const haystack = normalize(text);
  const hits = INDEX.filter((entry) => haystack.includes(entry.normalized));
  // A shorter hit contained in a longer one adds nothing (穩賺 inside 穩賺不賠);
  // reporting only the most specific keeps the rewrite instruction readable.
  return hits
    .filter(
      (entry) =>
        !hits.some(
          (other) =>
            other.normalized.length > entry.normalized.length &&
            other.normalized.includes(entry.normalized),
        ),
    )
    .map((entry) => entry.match);
}

export function describeSensitiveMatches(
  matches: readonly SensitiveMatch[],
): string {
  // Quoted back in the script the copy is written in, so the rewrite instruction
  // reads as the writer's own wording rather than as a Simplified lookup key.
  const detail = matches
    .map(
      (match) =>
        `${CATEGORY_LABELS[match.category]} "${convertTextToZhTW(match.term)}"`,
    )
    .join('; ');
  return `Rednote copy must not contain moderation-risk wording (${detail}). Restate it as neutral information; never evade review with homophones, pinyin, spacing or symbol substitutions.`;
}

/**
 * Last mile before the browser drives a publish. `copy.ts` already rejects the
 * generated fields, but the published text is title + body + hashtags joined,
 * and only this check sees that composition.
 */
export function assertRednoteCopySafe(finalText: string): void {
  const matches = findSensitiveTerms(finalText);
  if (matches.length === 0) return;
  throw new Error(describeSensitiveMatches(matches));
}

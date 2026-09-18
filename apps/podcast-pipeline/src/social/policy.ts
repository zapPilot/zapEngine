import type { SocialPlatform } from './platforms.js';
import type { SocialLanguageCode } from './types.js';

/**
 * Multilingual distribution started here. Episodes created before this date
 * were never given social lanes and must stay that way: `social_publish_
 * candidates` has no creation-time filter of its own, so re-rendering an
 * ancient episode's video would otherwise make its whole back catalogue
 * publishable in one daemon tick.
 */
export const SOCIAL_RELEASE_MIN_EPISODE_CREATED_AT = '2026-08-24T00:00:00.000Z';

/**
 * The language every platform ships, permanently. This is not an experiment
 * arm and not a default that a learned row may override: changing it is a
 * product decision that has to change this constant and the scoped AGENTS.md
 * contract together.
 *
 * Traditional Chinese reaches two platforms, Japanese one, English one, so a
 * single article still covers all three localizations.
 */
export const SOCIAL_LANGUAGE_BY_PLATFORM = {
  rednote: 'zh-Hant',
  threads: 'zh-Hant',
  x: 'ja',
  youtube: 'en',
} as const satisfies Record<SocialPlatform, SocialLanguageCode>;

/**
 * Every localization an article must have ready before it may consume a
 * release slot. Derived from the mapping above so the two can never disagree.
 */
export const SOCIAL_REQUIRED_RELEASE_LANGUAGES = [
  ...new Set(Object.values(SOCIAL_LANGUAGE_BY_PLATFORM)),
] as readonly SocialLanguageCode[];

export interface SocialReleaseSlot {
  hour: number;
  minute: number;
}

/**
 * NON-NEGOTIABLE release policy: one article consumes one release slot and all
 * active platform x language lanes of that episode share it. Reach optimisation
 * may change this article-level frequency or these candidate times, but must
 * never create a platform-specific schedule.
 */
export const SOCIAL_RELEASE_DAILY_CAP = 3;
export const SOCIAL_RELEASE_SLOTS = [
  { hour: 9, minute: 30 },
  { hour: 12, minute: 0 },
  { hour: 16, minute: 0 },
] as const satisfies readonly SocialReleaseSlot[];

/**
 * The long-lived daemon only publishes inside working hours, because Rednote
 * and X drive real browser sessions on a Mac that a person has to be able to
 * see fail. The explicit operator catch-up command may bypass this watch
 * window, but it still releases one whole article cohort and keeps every
 * publish safety/backoff fence.
 */
export const SOCIAL_PUBLISH_WINDOW_JST = { startHour: 9, endHour: 18 };

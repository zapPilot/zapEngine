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
 * The main Chinese lane (zh-Hant) reaches Rednote in Simplified and Threads in
 * Taiwan Traditional copy (with Simplified teaser subtitles); Japanese and
 * English each reach one platform, so a
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

export interface SocialReleaseCadence {
  minBacklogArticles: number;
  slots: readonly SocialReleaseSlot[];
}

/**
 * NON-NEGOTIABLE release policy: one article consumes one release slot and all
 * active platform x language lanes of that episode share it. The article-level
 * cadence adapts to the wholly unpublished durable queue, never to a specific
 * platform: 0-9 articles use 4/day, 10-20 use 5/day, and 21+ use 6/day.
 */
export const SOCIAL_RELEASE_CADENCES = [
  {
    minBacklogArticles: 21,
    slots: [
      { hour: 9, minute: 0 },
      { hour: 11, minute: 30 },
      { hour: 14, minute: 0 },
      { hour: 16, minute: 30 },
      { hour: 19, minute: 0 },
      { hour: 21, minute: 30 },
    ],
  },
  {
    minBacklogArticles: 10,
    slots: [
      { hour: 9, minute: 0 },
      { hour: 12, minute: 0 },
      { hour: 15, minute: 0 },
      { hour: 18, minute: 0 },
      { hour: 21, minute: 0 },
    ],
  },
  {
    minBacklogArticles: 0,
    slots: [
      { hour: 9, minute: 30 },
      { hour: 12, minute: 0 },
      { hour: 16, minute: 0 },
      { hour: 21, minute: 0 },
    ],
  },
] as const satisfies readonly SocialReleaseCadence[];

export function socialReleaseCadenceForBacklog(
  backlogArticles: number,
): SocialReleaseCadence {
  const normalized = Math.max(0, Math.floor(backlogArticles));
  return (
    SOCIAL_RELEASE_CADENCES.find(
      (cadence) => normalized >= cadence.minBacklogArticles,
    ) ?? SOCIAL_RELEASE_CADENCES[SOCIAL_RELEASE_CADENCES.length - 1]
  );
}

/**
 * The long-lived daemon only publishes inside the configured watch window,
 * because Rednote
 * and X drive real browser sessions on a Mac that a person has to be able to
 * see fail. The explicit operator catch-up command may bypass this watch
 * window, but it still releases one whole article cohort and keeps every
 * publish safety/backoff fence.
 */
export const SOCIAL_PUBLISH_WINDOW_JST = { startHour: 9, endHour: 23 };

export const SOCIAL_TITLE_MAX_CHARACTERS = {
  rednote: 20,
  youtube: 100,
} as const;

export function socialTitleBudgetsFor(language: SocialLanguageCode): number[] {
  return [
    ...new Set(
      Object.entries(SOCIAL_TITLE_MAX_CHARACTERS)
        .filter(
          ([platform]) =>
            SOCIAL_LANGUAGE_BY_PLATFORM[
              platform as keyof typeof SOCIAL_TITLE_MAX_CHARACTERS
            ] === language,
        )
        .map(([, budget]) => budget),
    ),
  ].sort((a, b) => a - b);
}

import type { SocialPlatform } from './platforms.js';
import type { SocialLanguageCode } from './types.js';

export interface SocialLanguagePolicyEntry {
  language: SocialLanguageCode;
  activeSince: string;
  experimentKey?: string;
  experimentVariant?: string;
  /**
   * Historical policies used `exclusive` to resolve one persisted language arm.
   * Current Latin-square allocation is resolved at article-slot scope instead;
   * `always` marks candidate lanes for strategy/reporting policy only.
   */
  assignment?: 'exclusive' | 'always';
}

const MULTILINGUAL_ACTIVE_SINCE = '2026-08-24T00:00:00.000Z';

/**
 * The balanced language experiment starts at 09:00 JST on 2026-09-01. Episodes
 * created before this instant keep their legacy lane shape even if released
 * later, so deploying the experiment never reshapes backlog.
 */
export const SOCIAL_LANGUAGE_ROTATION_ACTIVE_SINCE =
  '2026-09-01T00:00:00.000Z';

export const SOCIAL_LANGUAGE_EXPERIMENT_KEYS = {
  x: 'x-language-v2',
  threads: 'threads-language-v1',
  youtube: 'youtube-language-v1',
} as const satisfies Record<'x' | 'threads' | 'youtube', string>;

const ROTATING_LANGUAGES = ['en', 'ja', 'zh-Hant'] as const satisfies readonly SocialLanguageCode[];

function rotatingLanguagePolicy(
  experimentKey: string,
): SocialLanguagePolicyEntry[] {
  return ROTATING_LANGUAGES.map((language) => ({
    language,
    activeSince: SOCIAL_LANGUAGE_ROTATION_ACTIVE_SINCE,
    experimentKey,
    experimentVariant: language,
    assignment: 'always',
  }));
}

/**
 * Current candidate language surface. Rednote stays Traditional Chinese while
 * X, Threads, and YouTube each rotate through all three primary languages.
 * `language-allocation.ts` selects exactly one candidate per rotating platform
 * for each article slot, while preserving one cross-platform release cohort.
 */
export const SOCIAL_LANGUAGE_POLICY = {
  rednote: [
    { language: 'zh-Hant', activeSince: MULTILINGUAL_ACTIVE_SINCE },
  ],
  threads: rotatingLanguagePolicy(SOCIAL_LANGUAGE_EXPERIMENT_KEYS.threads),
  x: rotatingLanguagePolicy(SOCIAL_LANGUAGE_EXPERIMENT_KEYS.x),
  youtube: rotatingLanguagePolicy(SOCIAL_LANGUAGE_EXPERIMENT_KEYS.youtube),
} satisfies Record<SocialPlatform, readonly SocialLanguagePolicyEntry[]>;

/**
 * Kept only so an interrupted cohort scheduled before the v2 activation can
 * finish with the exact language contract it was created under.
 */
export const LEGACY_SOCIAL_LANGUAGE_POLICY = {
  rednote: [{ language: 'zh-Hant', activeSince: MULTILINGUAL_ACTIVE_SINCE }],
  threads: [{ language: 'ja', activeSince: MULTILINGUAL_ACTIVE_SINCE }],
  x: [
    {
      language: 'en',
      activeSince: MULTILINGUAL_ACTIVE_SINCE,
      experimentKey: 'x-language-v1',
      experimentVariant: 'en',
      assignment: 'exclusive',
    },
    {
      language: 'ja',
      activeSince: MULTILINGUAL_ACTIVE_SINCE,
      experimentKey: 'x-language-v1',
      experimentVariant: 'ja',
      assignment: 'exclusive',
    },
  ],
  youtube: [{ language: 'en', activeSince: MULTILINGUAL_ACTIVE_SINCE }],
} as const satisfies Record<
  SocialPlatform,
  readonly SocialLanguagePolicyEntry[]
>;

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
 * Publishing only runs inside working hours, because the Rednote and X
 * publishers drive real browser sessions on a Mac that a person has to be able
 * to see fail. A missed cohort is rescheduled as a whole, never lane-by-lane.
 */
export const SOCIAL_PUBLISH_WINDOW_JST = { startHour: 9, endHour: 18 };

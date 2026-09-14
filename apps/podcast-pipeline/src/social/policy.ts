import type { SocialPlatform } from './platforms.js';
import type { SocialLanguageCode } from './types.js';

export interface SocialLanguagePolicyEntry {
  language: SocialLanguageCode;
  activeSince: string;
  experimentKey?: string;
  experimentVariant?: string;
  /**
   * Historical policies used `exclusive` to resolve one persisted language arm.
   * Current fixed allocation no longer assigns language experiments; `always`
   * remains only for reconstructing historical cohorts.
   */
  assignment?: 'exclusive' | 'always';
}

const MULTILINGUAL_ACTIVE_SINCE = '2026-08-24T00:00:00.000Z';

/** Historical v2 activation fence. */
export const SOCIAL_LANGUAGE_ROTATION_ACTIVE_SINCE = '2026-09-02T00:00:00.000Z';

/**
 * Historical language experiment keys. They stay readable so persisted v1/v2/v3
 * cohorts and metrics remain attributable, but no new fixed-policy lane should
 * write one of these keys.
 */
export const HISTORICAL_SOCIAL_LANGUAGE_EXPERIMENT_KEYS = {
  x: 'x-language-v2',
  threads: 'threads-language-v1',
  youtube: 'youtube-language-v1',
} as const satisfies Record<'x' | 'threads' | 'youtube', string>;

/**
 * Backward-compatible classifier for persisted jobs. Runtime code may use this
 * set to recognize historical language experiment rows; it is not an active
 * assignment registry.
 */
export const SOCIAL_LANGUAGE_EXPERIMENT_KEYS =
  HISTORICAL_SOCIAL_LANGUAGE_EXPERIMENT_KEYS;

/** Historical Threads-fixed / X-YouTube swap activation fence. */
export const SOCIAL_LANGUAGE_THREADS_FIXED_SINCE = '2026-09-12T00:00:00.000Z';

/**
 * Final language decision, effective from 09:00 JST on 2026-09-14. New release
 * cohorts no longer participate in a language experiment.
 */
export const SOCIAL_LANGUAGE_FINAL_FIXED_SINCE = '2026-09-14T00:00:00.000Z';

export const SOCIAL_FINAL_LANGUAGE_BY_PLATFORM = {
  rednote: 'zh-Hant',
  threads: 'zh-Hant',
  x: 'ja',
  youtube: 'en',
} as const satisfies Record<SocialPlatform, SocialLanguageCode>;

/**
 * Current strategy/publishing language surface. Language experiments are over:
 * Rednote + Threads use Traditional Chinese, X uses Japanese, and YouTube uses
 * English. Historical cohort reconstruction lives in `language-allocation.ts`
 * and `LEGACY_SOCIAL_LANGUAGE_POLICY`, not in this active policy.
 */
export const SOCIAL_LANGUAGE_POLICY = {
  rednote: [
    {
      language: SOCIAL_FINAL_LANGUAGE_BY_PLATFORM.rednote,
      activeSince: MULTILINGUAL_ACTIVE_SINCE,
    },
  ],
  threads: [
    {
      language: SOCIAL_FINAL_LANGUAGE_BY_PLATFORM.threads,
      activeSince: SOCIAL_LANGUAGE_THREADS_FIXED_SINCE,
    },
  ],
  x: [
    {
      language: SOCIAL_FINAL_LANGUAGE_BY_PLATFORM.x,
      activeSince: SOCIAL_LANGUAGE_FINAL_FIXED_SINCE,
    },
  ],
  youtube: [
    {
      language: SOCIAL_FINAL_LANGUAGE_BY_PLATFORM.youtube,
      activeSince: SOCIAL_LANGUAGE_FINAL_FIXED_SINCE,
    },
  ],
} satisfies Record<SocialPlatform, readonly SocialLanguagePolicyEntry[]>;

/**
 * Kept only so an interrupted cohort scheduled before the experiment rollouts
 * can finish with the exact language contract it was created under.
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

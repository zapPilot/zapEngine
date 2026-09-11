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
 * The balanced language experiment starts at 09:00 JST on 2026-09-02. Episodes
 * created before this instant keep their legacy lane shape even if released
 * later, so deploying the experiment never reshapes backlog.
 */
export const SOCIAL_LANGUAGE_ROTATION_ACTIVE_SINCE = '2026-09-02T00:00:00.000Z';

export const SOCIAL_LANGUAGE_EXPERIMENT_KEYS = {
  x: 'x-language-v2',
  /**
   * Historical only: Threads ran a three-language experiment under this key
   * until the fixed-Chinese decision. New cohorts after
   * `SOCIAL_LANGUAGE_THREADS_FIXED_SINCE` ship Threads as a fixed `zh-Hant`
   * lane with no experiment key; the constant stays so reporting and guidance
   * on already-persisted lanes keep resolving.
   */
  threads: 'threads-language-v1',
  youtube: 'youtube-language-v1',
} as const satisfies Record<'x' | 'threads' | 'youtube', string>;

/**
 * Threads experiment conclusion: episodes created from 09:00 JST on 2026-09-12
 * ship Threads fixed to Traditional Chinese. Only new episodes use the fixed
 * shape; older cohorts keep the exact v2/legacy lane identities they were
 * created under.
 */
export const SOCIAL_LANGUAGE_THREADS_FIXED_SINCE = '2026-09-12T00:00:00.000Z';

function swapLanguagePolicy(
  experimentKey: string,
): SocialLanguagePolicyEntry[] {
  return (['ja', 'en'] as const satisfies readonly SocialLanguageCode[]).map(
    (language) => ({
      language,
      activeSince: SOCIAL_LANGUAGE_THREADS_FIXED_SINCE,
      experimentKey,
      experimentVariant: language,
      assignment: 'always',
    }),
  );
}

/**
 * Current candidate language surface. Rednote and Threads stay fixed to
 * Traditional Chinese while X and YouTube swap `ja`/`en` so every article
 * still covers all three languages. `language-allocation.ts` selects exactly
 * one candidate per swapping platform for each article slot, while preserving
 * one cross-platform release cohort.
 */
export const SOCIAL_LANGUAGE_POLICY = {
  rednote: [{ language: 'zh-Hant', activeSince: MULTILINGUAL_ACTIVE_SINCE }],
  threads: [
    { language: 'zh-Hant', activeSince: SOCIAL_LANGUAGE_THREADS_FIXED_SINCE },
  ],
  x: swapLanguagePolicy(SOCIAL_LANGUAGE_EXPERIMENT_KEYS.x),
  youtube: swapLanguagePolicy(SOCIAL_LANGUAGE_EXPERIMENT_KEYS.youtube),
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

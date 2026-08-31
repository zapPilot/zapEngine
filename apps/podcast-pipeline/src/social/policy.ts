import type { SocialPlatform } from './platforms.js';
import type { SocialLanguageCode } from './types.js';

export interface SocialLanguagePolicyEntry {
  language: SocialLanguageCode;
  activeSince: string;
  experimentKey?: string;
  experimentVariant?: string;
  /**
   * How `experimentKey` gates inclusion. `exclusive` resolves a real
   * `social_experiment_assignments` row and only the assigned language's lane
   * is included. `always` means every language listed always ships together;
   * `experimentKey`/`experimentVariant` are then just a reporting label, and no
   * assignment row is created for them, so consumers must not expect one.
   */
  assignment?: 'exclusive' | 'always';
}

const MULTILINGUAL_ACTIVE_SINCE = '2026-08-24T00:00:00.000Z';

export const SOCIAL_LANGUAGE_POLICY = {
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
  // Assets may still exist in other languages, but distribution is deliberately
  // English-only until a YouTube language experiment is explicitly activated.
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

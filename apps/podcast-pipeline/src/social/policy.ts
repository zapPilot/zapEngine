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

export interface SocialPublishSlot {
  hour: number;
  minute: number;
}

export interface PlatformPublishPolicy {
  /** Episodes this platform may publish on one JST day, across all languages. */
  dailyCap: number;
  /** Candidate times, not a queue: one episode takes one of them per day. */
  slots: readonly SocialPublishSlot[];
}

/**
 * How much of each platform's day this account spends, and when.
 *
 * This is code, not configuration, because a cap is the one thing the queue
 * must not be able to talk itself out of: the previous design read slots from
 * `social_strategy_versions`, where a learner writing a row could silently
 * widen the schedule it was supposed to be optimising inside. Production reach
 * medians are what set these numbers -- four cohorts a day meant eight to
 * eleven posts a day, and the marginal ones reached nobody.
 *
 * `x` is the only platform above one because its language experiment assigns
 * each episode exactly one of `en`/`ja`: two daily posts are two different
 * episodes, never the same one twice. Every slot sits inside
 * {@link SOCIAL_PUBLISH_WINDOW_JST}.
 */
export const PLATFORM_PUBLISH_POLICY = {
  rednote: {
    dailyCap: 1,
    slots: [
      { hour: 14, minute: 30 },
      { hour: 12, minute: 0 },
    ],
  },
  threads: {
    dailyCap: 1,
    slots: [
      { hour: 9, minute: 30 },
      { hour: 12, minute: 0 },
    ],
  },
  x: {
    dailyCap: 2,
    slots: [
      { hour: 12, minute: 15 },
      { hour: 17, minute: 0 },
    ],
  },
  youtube: {
    dailyCap: 1,
    slots: [{ hour: 17, minute: 15 }],
  },
} as const satisfies Record<SocialPlatform, PlatformPublishPolicy>;

/**
 * Publishing only runs inside working hours, because the Rednote and X
 * publishers drive real browser sessions on a Mac that a person has to be able
 * to see fail. A job whose slot has passed is rescheduled, never dropped.
 */
export const SOCIAL_PUBLISH_WINDOW_JST = { startHour: 9, endHour: 18 };

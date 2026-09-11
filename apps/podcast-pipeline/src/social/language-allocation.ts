import { JST_OFFSET_MS } from './jst.js';
import type { SocialPlatform } from './platforms.js';
import {
  SOCIAL_LANGUAGE_EXPERIMENT_KEYS,
  SOCIAL_LANGUAGE_ROTATION_ACTIVE_SINCE,
  SOCIAL_LANGUAGE_THREADS_FIXED_SINCE,
  SOCIAL_RELEASE_SLOTS,
} from './policy.js';
import type { SocialLanguageCode } from './types.js';

const DAY_MS = 24 * 60 * 60_000;
const ROTATION_ANCHOR_JST_DAY = Date.UTC(2026, 8, 2);

export const SOCIAL_LANGUAGE_PROFILE_ASSIGNMENT_KEY =
  'social-language-profile-v2';

/**
 * Durable allocation record for the post-Threads-decision shape. Its variant
 * is D/E (the X/YouTube `ja`/`en` swap), never a post-performance arm.
 * A separate key from v2 keeps the retired A/B/C letters from ever being
 * reinterpreted under the fixed-Threads lane shape.
 */
export const SOCIAL_LANGUAGE_SWAP_PROFILE_ASSIGNMENT_KEY =
  'social-language-profile-v3';

export interface RotatingReleaseCohortLane {
  platform: SocialPlatform;
  language: SocialLanguageCode;
  experimentKey?: string;
  experimentVariant?: string;
}

export const SOCIAL_REQUIRED_ROTATION_LANGUAGES = [
  'zh-Hant',
  'ja',
  'en',
] as const satisfies readonly SocialLanguageCode[];

export type SocialLanguageRotationProfile = 'A' | 'B' | 'C';

const ROTATION_PROFILES = [
  {
    profile: 'A',
    x: 'en',
    threads: 'ja',
    youtube: 'zh-Hant',
  },
  {
    profile: 'B',
    x: 'ja',
    threads: 'zh-Hant',
    youtube: 'en',
  },
  {
    profile: 'C',
    x: 'zh-Hant',
    threads: 'en',
    youtube: 'ja',
  },
] as const satisfies readonly {
  profile: SocialLanguageRotationProfile;
  x: SocialLanguageCode;
  threads: SocialLanguageCode;
  youtube: SocialLanguageCode;
}[];

export function isLanguageRotationActive(scheduledAt: Date): boolean {
  return (
    scheduledAt.getTime() >= Date.parse(SOCIAL_LANGUAGE_ROTATION_ACTIVE_SINCE)
  );
}

export function isThreadsFixedActive(scheduledAt: Date): boolean {
  return (
    scheduledAt.getTime() >= Date.parse(SOCIAL_LANGUAGE_THREADS_FIXED_SINCE)
  );
}

/**
 * Balanced Latin square:
 * Day 1 slots = A/B/C, Day 2 = B/C/A, Day 3 = C/A/B, then repeat.
 * Every platform therefore sees every language once per three article slots,
 * and a fixed clock slot sees every profile once per three JST days.
 */
export function languageRotationProfileForSlot(
  scheduledAt: Date,
): (typeof ROTATION_PROFILES)[number] {
  return profileForSlot(scheduledAt, ROTATION_PROFILES, 'Language rotation');
}

export function rotatingReleaseCohortLanes(
  scheduledAt: Date,
): RotatingReleaseCohortLane[] {
  return rotatingReleaseCohortLanesForProfile(
    languageRotationProfileForSlot(scheduledAt).profile,
  );
}

/**
 * Rebuild a durable v2 cohort from its persisted profile rather than from its
 * current timestamp. Missed-slot repair may move the whole article to a later
 * slot, but that must never change the languages it was originally assigned.
 *
 * Rotating lanes intentionally come before Rednote. `enqueueCohortJobs()`
 * persists lanes sequentially, so any interrupted v2 enqueue that wrote at
 * least one row leaves a platform-specific experiment key behind. Recovery can
 * then distinguish it from a legacy partial cohort; Rednote alone is ambiguous
 * because its lane is identical in both generations.
 */
export function rotatingReleaseCohortLanesForProfile(
  profileName: string,
): RotatingReleaseCohortLane[] {
  const profile = ROTATION_PROFILES.find(
    (candidate) => candidate.profile === profileName,
  );
  if (!profile) {
    throw new Error(`Unknown social language rotation profile ${profileName}.`);
  }

  return [
    {
      platform: 'x',
      language: profile.x,
      experimentKey: SOCIAL_LANGUAGE_EXPERIMENT_KEYS.x,
      experimentVariant: profile.x,
    },
    {
      platform: 'threads',
      language: profile.threads,
      experimentKey: SOCIAL_LANGUAGE_EXPERIMENT_KEYS.threads,
      experimentVariant: profile.threads,
    },
    {
      platform: 'youtube',
      language: profile.youtube,
      experimentKey: SOCIAL_LANGUAGE_EXPERIMENT_KEYS.youtube,
      experimentVariant: profile.youtube,
    },
    { platform: 'rednote', language: 'zh-Hant' },
  ];
}

/** A rotating platform/language pair uniquely identifies its Latin-square profile. */
export function languageRotationProfileForLane(
  platform: SocialPlatform,
  language: SocialLanguageCode,
): SocialLanguageRotationProfile | null {
  if (platform === 'rednote') return null;
  return (
    ROTATION_PROFILES.find((profile) => profile[platform] === language)
      ?.profile ?? null
  );
}

export type SocialLanguageSwapProfile = 'D' | 'E';

/**
 * Post-Threads-decision shape (episodes created from
 * `SOCIAL_LANGUAGE_THREADS_FIXED_SINCE`): Threads and Rednote are both fixed
 * to `zh-Hant` while X and YouTube swap `ja`/`en`, so every article still
 * covers all three languages somewhere in its final lane set.
 */
const SWAP_PROFILES = [
  {
    profile: 'D',
    x: 'ja',
    youtube: 'en',
  },
  {
    profile: 'E',
    x: 'en',
    youtube: 'ja',
  },
] as const satisfies readonly {
  profile: SocialLanguageSwapProfile;
  x: SocialLanguageCode;
  youtube: SocialLanguageCode;
}[];

/**
 * Two-way swap over the same three daily article slots: Day 1 slots run
 * D/E/D, Day 2 E/D/E, then repeat. Three slots cannot split evenly across two
 * profiles in one day, but the two-day cycle gives each swapping platform
 * three `ja` and three `en` articles, and each fixed clock slot alternates
 * day to day instead of confounding language with time-of-day.
 */
export function languageSwapProfileForSlot(
  scheduledAt: Date,
): (typeof SWAP_PROFILES)[number] {
  return profileForSlot(scheduledAt, SWAP_PROFILES, 'Language swap');
}

export function fixedThreadsReleaseCohortLanes(
  scheduledAt: Date,
): RotatingReleaseCohortLane[] {
  return fixedThreadsReleaseCohortLanesForProfile(
    languageSwapProfileForSlot(scheduledAt).profile,
  );
}

/**
 * Rebuild a durable v3 cohort from its persisted swap profile rather than
 * from its current timestamp. Same repair rule as v2: moving the whole
 * article to a later slot must never change the languages already allocated.
 *
 * Swapping lanes intentionally come before the fixed lanes. `enqueueCohortJobs()`
 * persists lanes sequentially, so any interrupted v3 enqueue that wrote at
 * least one row leaves a swapping-platform experiment key behind. Recovery can
 * then distinguish it from a legacy partial cohort; Threads/Rednote alone are
 * ambiguous because their fixed lanes are identical in every generation.
 */
export function fixedThreadsReleaseCohortLanesForProfile(
  profileName: string,
): RotatingReleaseCohortLane[] {
  const profile = SWAP_PROFILES.find(
    (candidate) => candidate.profile === profileName,
  );
  if (!profile) {
    throw new Error(`Unknown social language swap profile ${profileName}.`);
  }

  return [
    {
      platform: 'x',
      language: profile.x,
      experimentKey: SOCIAL_LANGUAGE_EXPERIMENT_KEYS.x,
      experimentVariant: profile.x,
    },
    {
      platform: 'youtube',
      language: profile.youtube,
      experimentKey: SOCIAL_LANGUAGE_EXPERIMENT_KEYS.youtube,
      experimentVariant: profile.youtube,
    },
    { platform: 'threads', language: 'zh-Hant' },
    { platform: 'rednote', language: 'zh-Hant' },
  ];
}

function profileForSlot<T extends readonly unknown[]>(
  scheduledAt: Date,
  profiles: T,
  policyName: string,
): T[number] {
  const jst = new Date(scheduledAt.getTime() + JST_OFFSET_MS);
  const slotIndex = SOCIAL_RELEASE_SLOTS.findIndex(
    (slot) =>
      slot.hour === jst.getUTCHours() && slot.minute === jst.getUTCMinutes(),
  );
  if (slotIndex < 0) {
    throw new Error(
      `${policyName} requires a configured article slot; got ${scheduledAt.toISOString()}.`,
    );
  }

  const jstDay = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate(),
  );
  const dayIndex = Math.floor((jstDay - ROTATION_ANCHOR_JST_DAY) / DAY_MS);
  return profiles[mod(dayIndex + slotIndex, profiles.length)]!;
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

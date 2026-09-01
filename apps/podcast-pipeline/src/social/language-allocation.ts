import type { SocialPlatform } from './platforms.js';
import {
  SOCIAL_LANGUAGE_EXPERIMENT_KEYS,
  SOCIAL_LANGUAGE_ROTATION_ACTIVE_SINCE,
  SOCIAL_RELEASE_SLOTS,
} from './policy.js';
import type { SocialLanguageCode } from './types.js';

const JST_OFFSET_MS = 9 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const ROTATION_ANCHOR_JST_DAY = Date.UTC(2026, 8, 2);

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

/**
 * Balanced Latin square:
 * Day 1 slots = A/B/C, Day 2 = B/C/A, Day 3 = C/A/B, then repeat.
 * Every platform therefore sees every language once per three article slots,
 * and a fixed clock slot sees every profile once per three JST days.
 */
export function languageRotationProfileForSlot(
  scheduledAt: Date,
): (typeof ROTATION_PROFILES)[number] {
  const jst = new Date(scheduledAt.getTime() + JST_OFFSET_MS);
  const slotIndex = SOCIAL_RELEASE_SLOTS.findIndex(
    (slot) =>
      slot.hour === jst.getUTCHours() && slot.minute === jst.getUTCMinutes(),
  );
  if (slotIndex < 0) {
    throw new Error(
      `Language rotation requires a configured article slot; got ${scheduledAt.toISOString()}.`,
    );
  }

  const jstDay = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate(),
  );
  const dayIndex = Math.floor((jstDay - ROTATION_ANCHOR_JST_DAY) / DAY_MS);
  const profileIndex = mod(dayIndex + slotIndex, ROTATION_PROFILES.length);
  return ROTATION_PROFILES[profileIndex]!;
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
  profileName: SocialLanguageRotationProfile,
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

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

import type { SocialPlatform } from './platforms.js';
import {
  SOCIAL_LANGUAGE_BY_PLATFORM,
  SOCIAL_RELEASE_MIN_EPISODE_CREATED_AT,
  SOCIAL_REQUIRED_RELEASE_LANGUAGES,
} from './policy.js';
import type { SocialLanguageCode } from './types.js';

export interface ReleaseCohortLane {
  platform: SocialPlatform;
  language: SocialLanguageCode;
}

function isReleasable(episodeCreatedAt: string): boolean {
  const createdAtMs = Date.parse(episodeCreatedAt);
  return (
    Number.isFinite(createdAtMs) &&
    createdAtMs >= Date.parse(SOCIAL_RELEASE_MIN_EPISODE_CREATED_AT)
  );
}

/**
 * The single definition of "which lanes does this episode's release cohort
 * have". Language is fixed per platform, so this depends on nothing but the
 * episode's eligibility -- not on the clock, not on a persisted assignment.
 *
 * This governs lanes a cohort is about to be *given*. An episode that already
 * has durable publish jobs keeps the lanes it was enqueued with:
 * `reconcileExistingCohort()` in `daemon.ts` falls back to those existing
 * lanes whenever they disagree with what this returns, so concluding the
 * language experiment never reshapes an already-scheduled cohort.
 */
export function resolveReleaseCohortLanes(
  episodeCreatedAt: string,
): ReleaseCohortLane[] {
  if (!isReleasable(episodeCreatedAt)) return [];
  return Object.entries(SOCIAL_LANGUAGE_BY_PLATFORM).map(
    ([platform, language]) => ({
      platform: platform as SocialPlatform,
      language,
    }),
  );
}

/**
 * Which localization media must be ready before a new article may consume a
 * release slot. Every article ships all three languages, so readiness cannot
 * be narrowed per platform.
 */
export function resolveRequiredReleaseLanguages(
  episodeCreatedAt: string,
): SocialLanguageCode[] {
  if (!isReleasable(episodeCreatedAt)) return [];
  return [...SOCIAL_REQUIRED_RELEASE_LANGUAGES];
}

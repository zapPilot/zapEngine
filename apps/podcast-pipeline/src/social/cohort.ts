import {
  getExperimentAssignment,
  getOrCreateExperimentAssignment,
} from './experiments.js';
import {
  finalReleaseCohortLanes,
  fixedThreadsReleaseCohortLanesForProfile,
  isFinalLanguagePolicyActive,
  isLanguageRotationActive,
  isThreadsFixedActive,
  languageRotationProfileForSlot,
  languageSwapProfileForSlot,
  rotatingReleaseCohortLanesForProfile,
  SOCIAL_LANGUAGE_PROFILE_ASSIGNMENT_KEY,
  SOCIAL_LANGUAGE_SWAP_PROFILE_ASSIGNMENT_KEY,
  SOCIAL_REQUIRED_ROTATION_LANGUAGES,
} from './language-allocation.js';
import type { SocialPlatform } from './platforms.js';
import {
  LEGACY_SOCIAL_LANGUAGE_POLICY,
  SOCIAL_LANGUAGE_ROTATION_ACTIVE_SINCE,
  SOCIAL_LANGUAGE_THREADS_FIXED_SINCE,
  type SocialLanguagePolicyEntry,
} from './policy.js';
import type { SocialLanguageCode } from './types.js';

const LEGACY_LANGUAGE_GENERATION_MARKER = 'x-language-v1';

export interface ReleaseCohortLane {
  platform: SocialPlatform;
  language: SocialLanguageCode;
  experimentKey?: string;
  experimentVariant?: string;
}

/**
 * The single definition of "which lanes does this episode's release cohort
 * have". From the final language-policy cutover onward, a cohort with no
 * persisted historical language assignment is fixed to X=ja, YouTube=en,
 * Threads=zh-Hant, Rednote=zh-Hant and carries no language experiment metadata.
 * Historical v1/v2/v3 assignments remain authoritative for already-started or
 * partially released cohorts.
 */
export async function resolveReleaseCohortLanes(input: {
  episodeId: string;
  episodeCreatedAt: string;
  scheduledAt: Date;
}): Promise<ReleaseCohortLane[]> {
  if (
    isFinalLanguagePolicyActive(input.scheduledAt) &&
    !(await hasPersistedHistoricalLanguageAssignment(input.episodeId))
  ) {
    return finalReleaseCohortLanes();
  }

  if (usesFixedThreadsShape(input.episodeCreatedAt, input.scheduledAt)) {
    if (await hasLegacyLanguageGeneration(input.episodeId)) {
      return resolveLegacyReleaseCohortLanes(input);
    }
    // A v2 cohort created before the v3 deploy must finish as v2: its persisted
    // A/B/C profile owns recovery, and deriving v3 would reshape durable lanes.
    if (await hasSwapPredecessorAssignment(input.episodeId)) {
      return resolveV2ReleaseCohortLanes(input);
    }

    const slotProfile = languageSwapProfileForSlot(input.scheduledAt).profile;
    const assignment = await getOrCreateExperimentAssignment({
      experimentKey: SOCIAL_LANGUAGE_SWAP_PROFILE_ASSIGNMENT_KEY,
      episodeId: input.episodeId,
      variants: [slotProfile],
    });
    return fixedThreadsReleaseCohortLanesForProfile(assignment.variant);
  }
  if (usesLanguageRotation(input.episodeCreatedAt, input.scheduledAt)) {
    if (await hasLegacyLanguageGeneration(input.episodeId)) {
      return resolveLegacyReleaseCohortLanes(input);
    }

    return resolveV2ReleaseCohortLanes(input);
  }
  return resolveLegacyReleaseCohortLanes(input);
}

async function resolveV2ReleaseCohortLanes(input: {
  episodeId: string;
  scheduledAt: Date;
}): Promise<ReleaseCohortLane[]> {
  const slotProfile = languageRotationProfileForSlot(input.scheduledAt).profile;
  const assignment = await getOrCreateExperimentAssignment({
    experimentKey: SOCIAL_LANGUAGE_PROFILE_ASSIGNMENT_KEY,
    episodeId: input.episodeId,
    variants: [slotProfile],
  });
  return rotatingReleaseCohortLanesForProfile(assignment.variant);
}

/**
 * Current fixed policy and historical v2/v3 cohorts all need the three primary
 * localizations before an article consumes a slot. Legacy pre-v2 cohorts only
 * wait for the languages their historical lane assignment actually needs.
 */
export async function resolveRequiredReleaseLanguages(input: {
  episodeId: string;
  episodeCreatedAt: string;
  prospectiveScheduledAt: Date;
}): Promise<SocialLanguageCode[]> {
  if (
    (isFinalLanguagePolicyActive(input.prospectiveScheduledAt) ||
      usesFixedThreadsShape(
        input.episodeCreatedAt,
        input.prospectiveScheduledAt,
      ) ||
      usesLanguageRotation(
        input.episodeCreatedAt,
        input.prospectiveScheduledAt,
      )) &&
    !(await hasLegacyLanguageGeneration(input.episodeId))
  ) {
    return [...SOCIAL_REQUIRED_ROTATION_LANGUAGES];
  }
  const lanes = await resolveLegacyReleaseCohortLanes({
    episodeId: input.episodeId,
    episodeCreatedAt: input.episodeCreatedAt,
  });
  return [...new Set(lanes.map((lane) => lane.language))];
}

function usesFixedThreadsShape(
  episodeCreatedAt: string,
  scheduledAt: Date,
): boolean {
  return usesLanguagePolicy(
    episodeCreatedAt,
    scheduledAt,
    SOCIAL_LANGUAGE_THREADS_FIXED_SINCE,
    isThreadsFixedActive,
  );
}

/**
 * A v2 profile persisted before the Threads-fixed deploy owns that episode's
 * recovery. v3 must not create its own assignment on top of it.
 */
async function hasSwapPredecessorAssignment(
  episodeId: string,
): Promise<boolean> {
  return Boolean(
    await getExperimentAssignment({
      experimentKey: SOCIAL_LANGUAGE_PROFILE_ASSIGNMENT_KEY,
      episodeId,
    }),
  );
}

/**
 * The final fixed policy must not reshape a cohort that already has durable
 * language-generation state. The cutover migration removes these assignments
 * only for fully unpublished queued cohorts that it rewrites atomically.
 */
async function hasPersistedHistoricalLanguageAssignment(
  episodeId: string,
): Promise<boolean> {
  for (const experimentKey of [
    LEGACY_LANGUAGE_GENERATION_MARKER,
    SOCIAL_LANGUAGE_PROFILE_ASSIGNMENT_KEY,
    SOCIAL_LANGUAGE_SWAP_PROFILE_ASSIGNMENT_KEY,
  ]) {
    if (
      await getExperimentAssignment({
        experimentKey,
        episodeId,
      })
    ) {
      return true;
    }
  }
  return false;
}

function usesLanguageRotation(
  episodeCreatedAt: string,
  scheduledAt: Date,
): boolean {
  return usesLanguagePolicy(
    episodeCreatedAt,
    scheduledAt,
    SOCIAL_LANGUAGE_ROTATION_ACTIVE_SINCE,
    isLanguageRotationActive,
  );
}

function usesLanguagePolicy(
  episodeCreatedAt: string,
  scheduledAt: Date,
  activeSince: string,
  isActive: (scheduledAt: Date) => boolean,
): boolean {
  const episodeCreatedAtMs = Date.parse(episodeCreatedAt);
  return (
    Number.isFinite(episodeCreatedAtMs) &&
    episodeCreatedAtMs >= Date.parse(activeSince) &&
    isActive(scheduledAt)
  );
}

async function hasLegacyLanguageGeneration(
  episodeId: string,
): Promise<boolean> {
  return Boolean(
    await getExperimentAssignment({
      experimentKey: LEGACY_LANGUAGE_GENERATION_MARKER,
      episodeId,
    }),
  );
}

async function resolveLegacyReleaseCohortLanes(input: {
  episodeId: string;
  episodeCreatedAt: string;
}): Promise<ReleaseCohortLane[]> {
  const episodeCreatedAtMs = Date.parse(input.episodeCreatedAt);
  const lanes: ReleaseCohortLane[] = [];

  for (const [platform, entries] of Object.entries(
    LEGACY_SOCIAL_LANGUAGE_POLICY,
  ) as [SocialPlatform, readonly SocialLanguagePolicyEntry[]][]) {
    const activeEntries = entries.filter(
      (entry) => episodeCreatedAtMs >= Date.parse(entry.activeSince),
    );
    for (const entry of activeEntries) {
      if (entry.assignment !== 'exclusive') {
        lanes.push({
          platform,
          language: entry.language,
          ...(entry.experimentKey
            ? { experimentKey: entry.experimentKey }
            : {}),
          ...(entry.experimentVariant
            ? { experimentVariant: entry.experimentVariant }
            : {}),
        });
        continue;
      }

      const experimentKey = entry.experimentKey;
      if (!experimentKey) continue;
      const variants = exclusiveVariants(activeEntries, experimentKey);
      const assignment = await getOrCreateExperimentAssignment({
        experimentKey,
        episodeId: input.episodeId,
        variants,
      });
      if (assignment.variant !== entry.language) continue;
      lanes.push({
        platform,
        language: entry.language,
        experimentKey,
        experimentVariant: assignment.variant,
      });
    }
  }

  return lanes;
}

function exclusiveVariants(
  entries: readonly { language: SocialLanguageCode; experimentKey?: string }[],
  experimentKey: string,
): [string, ...string[]] {
  const variants = entries
    .filter((entry) => entry.experimentKey === experimentKey)
    .map((entry) => entry.language);
  const [first, ...rest] = variants;
  if (!first) {
    throw new Error(`Experiment ${experimentKey} has no candidate languages.`);
  }
  return [first, ...rest];
}

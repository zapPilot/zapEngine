import { getOrCreateExperimentAssignment } from './experiments.js';
import {
  isLanguageRotationActive,
  languageRotationProfileForSlot,
  rotatingReleaseCohortLanesForProfile,
  SOCIAL_LANGUAGE_PROFILE_ASSIGNMENT_KEY,
  SOCIAL_REQUIRED_ROTATION_LANGUAGES,
} from './language-allocation.js';
import type { SocialPlatform } from './platforms.js';
import {
  LEGACY_SOCIAL_LANGUAGE_POLICY,
  SOCIAL_LANGUAGE_ROTATION_ACTIVE_SINCE,
  type SocialLanguagePolicyEntry,
} from './policy.js';
import type { SocialLanguageCode } from './types.js';

export interface ReleaseCohortLane {
  platform: SocialPlatform;
  language: SocialLanguageCode;
  experimentKey?: string;
  experimentVariant?: string;
}

/**
 * The single definition of "which lanes does this episode's release cohort
 * have". Only episodes created after the v2 activation enter the slot-balanced
 * Latin square; older backlog and already-scheduled cohorts keep the exact
 * historical policy even when their release slot lands after activation.
 */
export async function resolveReleaseCohortLanes(input: {
  episodeId: string;
  episodeCreatedAt: string;
  scheduledAt: Date;
}): Promise<ReleaseCohortLane[]> {
  if (usesLanguageRotation(input.episodeCreatedAt, input.scheduledAt)) {
    const slotProfile = languageRotationProfileForSlot(
      input.scheduledAt,
    ).profile;
    const assignment = await getOrCreateExperimentAssignment({
      experimentKey: SOCIAL_LANGUAGE_PROFILE_ASSIGNMENT_KEY,
      episodeId: input.episodeId,
      variants: [slotProfile],
    });
    return rotatingReleaseCohortLanesForProfile(assignment.variant);
  }
  return resolveLegacyReleaseCohortLanes(input);
}

/**
 * New language-v2 articles must wait for all three localizations before a slot
 * is consumed. Legacy cohorts only wait for the languages their historical lane
 * assignment actually needs.
 */
export async function resolveRequiredReleaseLanguages(input: {
  episodeId: string;
  episodeCreatedAt: string;
  prospectiveScheduledAt: Date;
}): Promise<SocialLanguageCode[]> {
  if (
    usesLanguageRotation(input.episodeCreatedAt, input.prospectiveScheduledAt)
  ) {
    return [...SOCIAL_REQUIRED_ROTATION_LANGUAGES];
  }
  const lanes = await resolveLegacyReleaseCohortLanes({
    episodeId: input.episodeId,
    episodeCreatedAt: input.episodeCreatedAt,
  });
  return [...new Set(lanes.map((lane) => lane.language))];
}

function usesLanguageRotation(
  episodeCreatedAt: string,
  scheduledAt: Date,
): boolean {
  const episodeCreatedAtMs = Date.parse(episodeCreatedAt);
  return (
    Number.isFinite(episodeCreatedAtMs) &&
    episodeCreatedAtMs >= Date.parse(SOCIAL_LANGUAGE_ROTATION_ACTIVE_SINCE) &&
    isLanguageRotationActive(scheduledAt)
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

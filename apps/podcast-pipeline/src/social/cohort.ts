import { getOrCreateExperimentAssignment } from './experiments.js';
import {
  isLanguageRotationActive,
  rotatingReleaseCohortLanes,
  SOCIAL_REQUIRED_ROTATION_LANGUAGES,
} from './language-allocation.js';
import type { SocialPlatform } from './platforms.js';
import {
  LEGACY_SOCIAL_LANGUAGE_POLICY,
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
 * have". Cohorts scheduled under language-v2 use the slot-balanced Latin square;
 * an interrupted pre-v2 cohort keeps the exact historical policy it started on.
 */
export async function resolveReleaseCohortLanes(input: {
  episodeId: string;
  episodeCreatedAt: string;
  scheduledAt: Date;
}): Promise<ReleaseCohortLane[]> {
  if (isLanguageRotationActive(input.scheduledAt)) {
    return rotatingReleaseCohortLanes(input.scheduledAt);
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
  if (isLanguageRotationActive(input.prospectiveScheduledAt)) {
    return [...SOCIAL_REQUIRED_ROTATION_LANGUAGES];
  }
  const lanes = await resolveLegacyReleaseCohortLanes({
    episodeId: input.episodeId,
    episodeCreatedAt: input.episodeCreatedAt,
  });
  return [...new Set(lanes.map((lane) => lane.language))];
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

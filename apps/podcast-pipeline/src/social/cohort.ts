import { getOrCreateExperimentAssignment } from './experiments.js';
import type { SocialPlatform } from './platforms.js';
import {
  SOCIAL_LANGUAGE_POLICY,
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
 * have": every platform × language pair whose policy is active for this
 * episode, with `exclusive` experiments resolved to the one assigned
 * language. Enqueue, the media readiness barrier, and publish preflight all
 * call this so they can never disagree about the cohort's shape.
 */
export async function resolveReleaseCohortLanes(input: {
  episodeId: string;
  episodeCreatedAt: string;
}): Promise<ReleaseCohortLane[]> {
  const episodeCreatedAtMs = Date.parse(input.episodeCreatedAt);
  const lanes: ReleaseCohortLane[] = [];

  for (const [platform, entries] of Object.entries(SOCIAL_LANGUAGE_POLICY) as [
    SocialPlatform,
    readonly SocialLanguagePolicyEntry[],
  ][]) {
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

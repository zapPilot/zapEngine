import { getOrCreateExperimentAssignment } from './experiments.js';
import type { SocialPlatform } from './platforms.js';
import type { SocialLanguageCode } from './types.js';

export interface PackagingExperimentVariant {
  variant: string;
  instruction: string;
}

export interface PackagingExperiment {
  key: string;
  platform: SocialPlatform;
  languageCode?: SocialLanguageCode;
  variants: readonly [
    PackagingExperimentVariant,
    ...PackagingExperimentVariant[],
  ];
}

export interface PackagingAssignment {
  key: string;
  variant: string;
  instruction: string;
}

/**
 * Packaging experiments are independent from the fixed language allocation.
 * Keep only explicitly registered treatments here; concluding the language
 * experiment does not implicitly activate new X/Threads/YouTube copy tests.
 *
 * `activePackagingExperiment` takes the first entry matching a platform and
 * language, so a platform carries exactly one live experiment. Superseding one
 * means replacing its entry, not appending beside it -- a second rednote entry
 * would simply never be reached.
 */
export const PACKAGING_EXPERIMENTS: readonly PackagingExperiment[] = [];


export function activePackagingExperiment(
  platform: SocialPlatform,
  languageCode: SocialLanguageCode,
): PackagingExperiment | undefined {
  return PACKAGING_EXPERIMENTS.find(
    (experiment) =>
      experiment.platform === platform &&
      (!experiment.languageCode || experiment.languageCode === languageCode),
  );
}

export async function resolvePackagingAssignments(input: {
  episodeId: string;
  languageCode: SocialLanguageCode;
  platforms: readonly SocialPlatform[];
}): Promise<Partial<Record<SocialPlatform, PackagingAssignment>>> {
  const assignments: Partial<Record<SocialPlatform, PackagingAssignment>> = {};
  for (const platform of [...new Set(input.platforms)]) {
    const experiment = activePackagingExperiment(platform, input.languageCode);
    if (!experiment) continue;
    const assignment = await getOrCreateExperimentAssignment({
      experimentKey: experiment.key,
      episodeId: input.episodeId,
      variants: experiment.variants.map((entry) => entry.variant) as [
        string,
        ...string[],
      ],
    });
    const variant = experiment.variants.find(
      (entry) => entry.variant === assignment.variant,
    );
    if (!variant) {
      throw new Error(
        `Persisted packaging variant ${assignment.variant} is not registered for ${experiment.key}.`,
      );
    }
    assignments[platform] = {
      key: experiment.key,
      variant: variant.variant,
      instruction: variant.instruction,
    };
  }
  return assignments;
}

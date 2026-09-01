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
 * Keep only Rednote packaging exploration active while X, Threads, and YouTube
 * run the cross-platform language experiment. Mixing language and copy-treatment
 * experiments at the current sample volume would fragment each cell and make a
 * language winner impossible to attribute cleanly.
 */
export const PACKAGING_EXPERIMENTS: readonly PackagingExperiment[] = [
  {
    key: 'rednote-packaging-v1-zh-Hant',
    platform: 'rednote',
    languageCode: 'zh-Hant',
    variants: [
      {
        variant: 'direct',
        instruction:
          'Write the Rednote title as a direct statement of the grounded episode finding without inventing certainty or exaggerating it.',
      },
      {
        variant: 'hook_first',
        instruction:
          'Write the Rednote title to lead with the strongest grounded curiosity hook without exaggerating the episode finding.',
      },
    ],
  },
];

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

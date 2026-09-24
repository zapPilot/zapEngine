import type { SocialPlatform } from './platforms.js';
import type { SocialLanguageCode } from './types.js';

export interface PackagingAssignment {
  key: string;
  variant: string;
  instruction: string;
}

/**
 * Platform-specific packaging experiments are intentionally disabled.
 *
 * Titles are finalized upstream in episode_localizations and social publishing
 * must not create another title strategy. Keep these helpers as the stable
 * daemon/copy boundary so old callers continue to work while returning no
 * assignments.
 */
export function activePackagingExperiment(
  _platform: SocialPlatform,
  _languageCode: SocialLanguageCode,
): undefined {
  return undefined;
}

export async function resolvePackagingAssignments(_input: {
  episodeId: string;
  languageCode: SocialLanguageCode;
  platforms: readonly SocialPlatform[];
}): Promise<Partial<Record<SocialPlatform, PackagingAssignment>>> {
  return {};
}

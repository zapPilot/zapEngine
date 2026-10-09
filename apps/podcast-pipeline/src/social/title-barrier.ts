import { resolveTransportTitle, type SocialComposeEpisode } from './compose.js';
import { findSensitiveTerms } from './lexicon/index.js';
import { platformLabel, type SocialPlatform } from './platforms.js';

/**
 * What the release barrier asks before any lane of a cohort is published:
 * can every titled platform be sent exactly the title it will receive? It runs
 * the same `resolveTransportTitle` the job builder and telemetry run, on the
 * same `SocialEpisode` the batch was prepared with, plus the Rednote lexicon
 * that `assertRednoteCopySafe` would otherwise only apply mid-cohort. An empty
 * result means the cohort may proceed.
 */
export function findTransportTitleProblems(
  episode: SocialComposeEpisode,
  lanes: readonly {
    platform: SocialPlatform;
    titleOverride?: string | null;
  }[],
): string[] {
  const problems: string[] = [];
  for (const { platform, titleOverride } of lanes) {
    if (platform !== 'rednote' && platform !== 'youtube') continue;
    const resolved = resolveTransportTitle(episode, platform, titleOverride);
    if (resolved.title === null) {
      problems.push(`${platformLabel(platform)}: ${resolved.reason}`);
      continue;
    }
    if (platform !== 'rednote') continue;
    const terms = findSensitiveTerms(resolved.title).map(({ term }) => term);
    if (terms.length > 0) {
      problems.push(
        `${platformLabel(platform)}: title contains risk terms ${terms.join(', ')}`,
      );
    }
  }
  return problems;
}

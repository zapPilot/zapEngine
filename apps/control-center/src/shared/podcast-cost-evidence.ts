/**
 * Folds per-episode cost evidence into the totals every surface quotes.
 *
 * The client card, the R10 statement and the daily metric snapshot all need the
 * same three answers, and they have to agree: a share that is null rather than
 * 0% when nothing was spent, and confirmed-waste figures that stay `null` until
 * the ledger can actually say $0 rather than merely failing to find any.
 */

import type { PodcastEpisodeCostSummary } from './types.js';

export interface EvidenceAmount {
  /** Null when no episode could report a figure, so nothing is known. */
  usd: number | null;
  /** True when at least one episode's evidence was missing or partial. */
  lowerBound: boolean;
}

export interface PodcastCostEvidenceTotals {
  totalCostUsd: number;
  failedAttemptCostUsd: number;
  /** Null when nothing was spent: a share of zero spend is not 0%. */
  failedAttemptShare: number | null;
  confirmedRetryWaste: EvidenceAmount;
  interruptedAttemptCost: EvidenceAmount;
  deploymentInterruptionCostUsd: number;
  shutdownInterruptionCostUsd: number;
  unknownLineageStages: number;
  unknownFailureReasonStages: number;
}

function foldEvidence(entries: readonly EvidenceAmount[]): EvidenceAmount {
  let usd: number | null = null;
  let lowerBound = false;
  for (const entry of entries) {
    if (entry.usd === null) {
      lowerBound = true;
      continue;
    }
    usd = (usd ?? 0) + entry.usd;
    lowerBound ||= entry.lowerBound;
  }
  return { usd, lowerBound };
}

export function podcastCostEvidenceTotals(
  episodes: readonly PodcastEpisodeCostSummary[],
): PodcastCostEvidenceTotals {
  const sum = (pick: (episode: PodcastEpisodeCostSummary) => number) =>
    episodes.reduce((total, episode) => total + pick(episode), 0);
  const totalCostUsd = sum((episode) => episode.totalCostUsd);
  const failedAttemptCostUsd = sum((episode) => episode.failedAttemptCostUsd);

  return {
    totalCostUsd,
    failedAttemptCostUsd,
    failedAttemptShare:
      totalCostUsd > 0 ? failedAttemptCostUsd / totalCostUsd : null,
    confirmedRetryWaste: foldEvidence(
      episodes.map((episode) => ({
        usd: episode.confirmedRetryWasteUsd,
        lowerBound: episode.confirmedRetryWasteIsLowerBound,
      })),
    ),
    interruptedAttemptCost: foldEvidence(
      episodes.map((episode) => ({
        usd: episode.interruptedAttemptCostUsd,
        lowerBound: episode.unknownFailureReasonStages > 0,
      })),
    ),
    deploymentInterruptionCostUsd: sum(
      (episode) => episode.confirmedDeploymentInterruptionCostUsd,
    ),
    shutdownInterruptionCostUsd: sum(
      (episode) => episode.shutdownInterruptionCostUsd,
    ),
    unknownLineageStages: sum((episode) => episode.unknownLineageStages),
    unknownFailureReasonStages: sum(
      (episode) => episode.unknownFailureReasonStages,
    ),
  };
}

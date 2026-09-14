import { describe, expect, it } from 'vitest';

import { podcastEpisodeCostFixture } from '../client/__fixtures__/dashboard.js';
import { podcastCostEvidenceTotals } from './podcast-cost-evidence.js';

describe('podcastCostEvidenceTotals', () => {
  it('shares failed-attempt spend across all episode spend', () => {
    const totals = podcastCostEvidenceTotals([
      podcastEpisodeCostFixture({ totalCostUsd: 10, failedAttemptCostUsd: 2 }),
      podcastEpisodeCostFixture({ totalCostUsd: 30, failedAttemptCostUsd: 3 }),
    ]);

    expect(totals.totalCostUsd).toBe(40);
    expect(totals.failedAttemptCostUsd).toBe(5);
    expect(totals.failedAttemptShare).toBe(0.125);
  });

  it('refuses to report a share of zero spend as 0%', () => {
    const totals = podcastCostEvidenceTotals([
      podcastEpisodeCostFixture({ totalCostUsd: 0, failedAttemptCostUsd: 0 }),
    ]);

    expect(totals.failedAttemptShare).toBeNull();
  });

  it('keeps confirmed waste unknown while no episode can report one', () => {
    const totals = podcastCostEvidenceTotals([
      podcastEpisodeCostFixture({ confirmedRetryWasteUsd: null }),
      podcastEpisodeCostFixture({ confirmedRetryWasteUsd: null }),
    ]);

    expect(totals.confirmedRetryWaste).toEqual({ usd: null, lowerBound: true });
  });

  it('adds up what is known and marks the rest as a floor', () => {
    const totals = podcastCostEvidenceTotals([
      podcastEpisodeCostFixture({
        confirmedRetryWasteUsd: 0.25,
        confirmedRetryWasteIsLowerBound: false,
      }),
      podcastEpisodeCostFixture({ confirmedRetryWasteUsd: null }),
    ]);

    expect(totals.confirmedRetryWaste).toEqual({ usd: 0.25, lowerBound: true });
  });

  it('states an exact total once every episode has complete evidence', () => {
    const totals = podcastCostEvidenceTotals([
      podcastEpisodeCostFixture({
        confirmedRetryWasteUsd: 0.25,
        confirmedRetryWasteIsLowerBound: false,
      }),
      podcastEpisodeCostFixture({
        confirmedRetryWasteUsd: 0,
        confirmedRetryWasteIsLowerBound: false,
      }),
    ]);

    expect(totals.confirmedRetryWaste).toEqual({
      usd: 0.25,
      lowerBound: false,
    });
  });

  it('treats a missing failure reason as a floor on interrupted spend', () => {
    const totals = podcastCostEvidenceTotals([
      podcastEpisodeCostFixture({
        interruptedAttemptCostUsd: 0.5,
        confirmedDeploymentInterruptionCostUsd: 0.3,
        shutdownInterruptionCostUsd: 0.2,
        unknownFailureReasonStages: 2,
      }),
    ]);

    expect(totals.interruptedAttemptCost).toEqual({
      usd: 0.5,
      lowerBound: true,
    });
    expect(totals.deploymentInterruptionCostUsd).toBe(0.3);
    expect(totals.shutdownInterruptionCostUsd).toBe(0.2);
    expect(totals.unknownFailureReasonStages).toBe(2);
  });
});

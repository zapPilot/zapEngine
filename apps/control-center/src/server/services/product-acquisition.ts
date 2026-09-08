import type { OperationsResponse } from '../../shared/types.js';

export interface ProductAcquisitionMetrics {
  uniqueUsers7d: number | null;
  uniqueUsers30d: number | null;
  landingVisitors7d: number | null;
  landingVisitors30d: number | null;
  ctaUsers7d: number | null;
  ctaUsers30d: number | null;
  appVisitors7d: number | null;
  appVisitors30d: number | null;
  walletConnectedUsers7d: number | null;
  walletConnectedUsers30d: number | null;
  landingDeadClickUsers7d: number | null;
}

/**
 * Product acquisition is already collected with the operations snapshot. Keep
 * this projection pure so Product/Home can consume the same PostHog read
 * without issuing a second provider query. The eventual waitlist source of
 * truth can extend this model without teaching statement rules about signal
 * fingerprints or arbitrary evidence keys.
 */
export function productAcquisitionFromOperations(
  operations: OperationsResponse,
): ProductAcquisitionMetrics | null {
  const signal = operations.signals.find(
    (candidate) =>
      candidate.source === 'posthog' &&
      candidate.fingerprint === 'posthog:audience/project' &&
      candidate.status === 'healthy',
  );
  if (!signal) {
    return null;
  }

  const evidence = signal.evidence;
  return {
    uniqueUsers7d: numberEvidence(evidence.uniqueUsers7d),
    uniqueUsers30d: numberEvidence(evidence.uniqueUsers30d),
    landingVisitors7d: numberEvidence(evidence.landingVisitors7d),
    landingVisitors30d: numberEvidence(evidence.landingVisitors30d),
    ctaUsers7d: numberEvidence(evidence.ctaUsers7d),
    ctaUsers30d: numberEvidence(evidence.ctaUsers30d),
    appVisitors7d: numberEvidence(evidence.appVisitors7d),
    appVisitors30d: numberEvidence(evidence.appVisitors30d),
    walletConnectedUsers7d: numberEvidence(evidence.walletConnectedUsers7d),
    walletConnectedUsers30d: numberEvidence(evidence.walletConnectedUsers30d),
    landingDeadClickUsers7d: numberEvidence(evidence.landingDeadClickUsers7d),
  };
}

function numberEvidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

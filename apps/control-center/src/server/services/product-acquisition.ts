import type { OperationsResponse } from '../../shared/types.js';
import { evidenceNumber } from './operations/evidence.js';

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

  return {
    uniqueUsers7d: evidenceNumber(signal, 'uniqueUsers7d'),
    uniqueUsers30d: evidenceNumber(signal, 'uniqueUsers30d'),
    landingVisitors7d: evidenceNumber(signal, 'landingVisitors7d'),
    landingVisitors30d: evidenceNumber(signal, 'landingVisitors30d'),
    ctaUsers7d: evidenceNumber(signal, 'ctaUsers7d'),
    ctaUsers30d: evidenceNumber(signal, 'ctaUsers30d'),
    appVisitors7d: evidenceNumber(signal, 'appVisitors7d'),
    appVisitors30d: evidenceNumber(signal, 'appVisitors30d'),
    walletConnectedUsers7d: evidenceNumber(signal, 'walletConnectedUsers7d'),
    walletConnectedUsers30d: evidenceNumber(
      signal,
      'walletConnectedUsers30d',
    ),
    landingDeadClickUsers7d: evidenceNumber(signal, 'landingDeadClickUsers7d'),
  };
}

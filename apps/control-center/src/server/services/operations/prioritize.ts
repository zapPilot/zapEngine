import type {
  OperationalPriority,
  OperationalSignal,
  OperationalStatus,
  OperationsDomain,
} from '../../../shared/types.js';
import { evidenceNumber } from './evidence.js';

/**
 * Deterministic triage. A human scanning eight domains and an agent reading
 * `ops:status --json` have to agree on what matters most, which rules out
 * asking a model and rules out per-adapter opinions. The whole ranking is this
 * table plus a handful of evidence boosts.
 */
const STATUS_BASE: Record<OperationalStatus, number> = {
  critical: 70,
  degraded: 40,
  unknown: 15,
  healthy: 0,
};

/**
 * How much a domain being wrong actually costs. Customers first because a
 * broken customer signal is money leaving; analytics last because losing
 * product analytics for a day costs nothing operationally.
 */
const DOMAIN_WEIGHT: Record<OperationsDomain, number> = {
  customers: 9,
  social: 8,
  infra: 8,
  jobs: 6,
  errors: 6,
  costs: 4,
  product: 2,
  analytics: 0,
};

/**
 * Below this, a signal is visible in its domain but is not asking for a
 * decision. The floor is set so that `unknown` can never reach the list:
 * 15 + the largest domain weight (9) is 24. An unconfigured integration is a
 * setup task, not an incident.
 */
const PRIORITY_THRESHOLD = 25;
const MAX_PRIORITIES = 12;
const AUM_AT_RISK_FLOOR_USD = 10_000;

interface Boost {
  points: number;
  reason: string;
}

export function prioritize(
  signals: readonly OperationalSignal[],
): OperationalPriority[] {
  return signals
    .map((signal) => score(signal))
    .filter((priority) => priority.score >= PRIORITY_THRESHOLD)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.signal.fingerprint.localeCompare(right.signal.fingerprint),
    )
    .slice(0, MAX_PRIORITIES);
}

function score(signal: OperationalSignal): OperationalPriority {
  const base = STATUS_BASE[signal.status];
  const weight = DOMAIN_WEIGHT[signal.domain];
  const boosts = collectBoosts(signal);
  const total = Math.min(
    100,
    base + weight + boosts.reduce((sum, boost) => sum + boost.points, 0),
  );
  return {
    signal,
    score: total,
    reasons: [
      `${signal.status} ${signal.domain} signal`,
      ...boosts.map((boost) => boost.reason),
    ],
  };
}

/**
 * Boosts apply only to signals that are already wrong. A healthy row carrying
 * `affectedUsers` describes reach, not damage, and must not be able to climb
 * over the threshold on the strength of a large denominator.
 */
function collectBoosts(signal: OperationalSignal): Boost[] {
  if (signal.status !== 'degraded' && signal.status !== 'critical') {
    return [];
  }

  const boosts: Boost[] = [];
  const overdueMinutes = evidenceNumber(signal, 'overdueMinutes');
  if (overdueMinutes !== null && overdueMinutes >= 30) {
    boosts.push({
      points: Math.min(15, Math.floor(overdueMinutes / 30) * 5),
      reason: `overdue by ${Math.round(overdueMinutes)} min`,
    });
  }

  const failureStreak = evidenceNumber(signal, 'failureStreak');
  if (failureStreak !== null && failureStreak > 0) {
    boosts.push({
      points: Math.min(10, failureStreak * 5),
      reason: `${failureStreak} consecutive failures`,
    });
  }

  const issueCount = evidenceNumber(signal, 'issueCount');
  if (issueCount !== null && issueCount > 0) {
    boosts.push({
      points: Math.min(10, issueCount * 2),
      reason: `${issueCount} unresolved issues`,
    });
  }

  if (signal.evidence['attemptsExhausted'] === true) {
    boosts.push({ points: 10, reason: 'retries exhausted — will never run' });
  }

  const affectedUsers = evidenceNumber(signal, 'affectedUsers');
  if (affectedUsers !== null && affectedUsers > 0) {
    boosts.push({
      points: Math.min(10, affectedUsers * 2),
      reason: `${affectedUsers} users affected`,
    });
  }

  const aumAtRisk = evidenceNumber(signal, 'aumAtRiskUsd');
  if (aumAtRisk !== null && aumAtRisk > AUM_AT_RISK_FLOOR_USD) {
    boosts.push({
      points: 8,
      reason: `$${Math.round(aumAtRisk).toLocaleString('en-US')} AUM affected`,
    });
  }

  return boosts;
}

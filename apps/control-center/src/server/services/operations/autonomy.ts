import type { OperationalSignal } from '../../../shared/types.js';
import { evidenceNumber } from './evidence.js';
import { parseOperationalFingerprint } from './inspection/fingerprint.js';
import type {
  EvidenceGap,
  SignalInspectionStatus,
} from './inspection/types.js';

export const REMEDIATION_POLICY_VERSION = 'ops-autonomy-v1';

/** Whether the operational reading itself can be trusted. */
export type RemediationObserver =
  | 'ok'
  | 'unknown'
  | 'source-failure'
  | 'not-active';

/** How much deep provider evidence actually backs this incident. */
export type RemediationInspectionCoverage =
  | 'inspected'
  | 'no-inspector'
  | 'unavailable'
  | 'not-found';

/**
 * Server-known facts about whether an incident is safe to act on, and nothing
 * else.
 *
 * The server deliberately does not grade autonomy. Whether a repair is safe
 * depends on the *kind of change* it needs — a null guard and a schema
 * migration can come from the same signal — and change kind is only knowable
 * after an agent has diagnosed the root cause. `.agents/skills/
 * ops-incident-remediation` owns that judgement; this type owns the facts it
 * cannot see, plus the refusals the server can prove.
 *
 * `operationalPriorityScore` rides along so an agent can see impact next to
 * safety. It is never an authorization input: the priority engine weights
 * customers and infrastructure highest precisely because they cost the most
 * when wrong, which is an argument for *less* autonomy, not more.
 */
export interface RemediationFacts {
  policyVersion: typeof REMEDIATION_POLICY_VERSION;
  operationalPriorityScore: number | null;
  observer: RemediationObserver;
  inspectionCoverage: RemediationInspectionCoverage;
  exposure: {
    affectedUsers: number | null;
    aumAtRiskUsd: number | null;
  };
  terminalState: boolean;
  directMutationAllowed: false;
  /** Non-empty means the server can prove this is not safe to act on yet. */
  blockers: string[];
  reasons: string[];
}

const COVERAGE_BY_INSPECTION: Record<
  SignalInspectionStatus,
  RemediationInspectionCoverage
> = {
  ok: 'inspected',
  unsupported: 'no-inspector',
  unavailable: 'unavailable',
  'not-found': 'not-found',
};

const OBSERVER_BLOCKER: Record<RemediationObserver, string | null> = {
  ok: null,
  unknown: 'operational state is unknown, and unknown is never healthy',
  'source-failure':
    'the observer failed, so the state of the observed system is unproven',
  'not-active': 'the fingerprint is not active in the current snapshot',
};

interface CoverageNote {
  reason: string;
  blocker?: string;
}

/**
 * The gap-count check alone would read "no inspector exists" as "nothing is
 * wrong": sources without an inspector return an empty gap list by
 * construction. Coverage is therefore derived from the inspection status
 * rather than from how many gaps came back.
 */
const COVERAGE_NOTE: Record<RemediationInspectionCoverage, CoverageNote> = {
  inspected: {
    reason: 'deep provider inspection completed for this signal',
  },
  'no-inspector': {
    reason:
      'no deep inspector exists for this source, so an empty gap list is not evidence; establish root cause from repository evidence and do not call the incident production-verified',
  },
  unavailable: {
    reason: 'the provider read failed rather than returning clean evidence',
    blocker: 'deep inspection was unavailable, so provider evidence is missing',
  },
  'not-found': {
    reason: 'the provider was reachable but reported no matching entity',
    blocker: 'the inspected entity no longer exists, so nothing is confirmed',
  },
};

export function buildRemediationFacts(input: {
  signal: OperationalSignal | undefined;
  operationalPriorityScore: number | null;
  inspectionStatus: SignalInspectionStatus;
  evidenceGaps: readonly EvidenceGap[];
}): RemediationFacts {
  const observer = observerState(input.signal);
  const inspectionCoverage = COVERAGE_BY_INSPECTION[input.inspectionStatus];
  const coverageNote = COVERAGE_NOTE[inspectionCoverage];
  const affectedUsers = signalNumber(input.signal, 'affectedUsers');
  const aumAtRiskUsd = signalNumber(input.signal, 'aumAtRiskUsd');
  const terminalState = input.signal?.evidence['attemptsExhausted'] === true;

  const blockers: string[] = [];
  const reasons: string[] = [coverageNote.reason];

  pushDefined(blockers, OBSERVER_BLOCKER[observer]);
  pushDefined(blockers, coverageNote.blocker);

  if (input.signal?.status === 'healthy') {
    blockers.push('the signal is healthy, so there is nothing to remediate');
  }

  for (const gap of input.evidenceGaps) {
    blockers.push(`${gap.source}: ${gap.reason}`);
  }

  if (aumAtRiskUsd !== null && aumAtRiskUsd > 0) {
    blockers.push(
      'AUM is at risk, so remediation stays on a human-controlled rail',
    );
  }

  if (affectedUsers !== null && affectedUsers > 0) {
    reasons.push(
      `${Math.round(affectedUsers)} affected users increase blast radius`,
    );
  }

  if (terminalState) {
    reasons.push('terminal retry state is deterministic remediation evidence');
  }

  return {
    policyVersion: REMEDIATION_POLICY_VERSION,
    operationalPriorityScore: input.operationalPriorityScore,
    observer,
    inspectionCoverage,
    exposure: { affectedUsers, aumAtRiskUsd },
    terminalState,
    directMutationAllowed: false,
    blockers: unique(blockers),
    reasons: unique(reasons),
  };
}

function observerState(
  signal: OperationalSignal | undefined,
): RemediationObserver {
  if (!signal) {
    return 'not-active';
  }
  if (signal.status === 'unknown') {
    return 'unknown';
  }
  const parsed = parseOperationalFingerprint(signal.fingerprint);
  return parsed?.kind === 'source-failure' ? 'source-failure' : 'ok';
}

function signalNumber(
  signal: OperationalSignal | undefined,
  key: string,
): number | null {
  return signal ? evidenceNumber(signal, key) : null;
}

function pushDefined(target: string[], value: string | null | undefined): void {
  if (value) {
    target.push(value);
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

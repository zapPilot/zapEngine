import type {
  OperationalSignal,
  OperationsDomain,
} from '../../../shared/types.js';
import { parseOperationalFingerprint } from './inspection/fingerprint.js';

export const REMEDIATION_POLICY_VERSION = 'ops-autonomy-v1';

export type RemediationAutonomy =
  | 'observe'
  | 'auto-pr'
  | 'approval-required';
export type RemediationRisk = 'low' | 'medium' | 'high';

export interface RemediationEvidenceGap {
  source: string;
  reason: string;
}

export interface RemediationAssessment {
  policyVersion: typeof REMEDIATION_POLICY_VERSION;
  operationalPriorityScore: number | null;
  suitabilityScore: number;
  autonomy: RemediationAutonomy;
  risk: RemediationRisk;
  evidenceReady: boolean;
  directMutationAllowed: false;
  reasons: string[];
  blockers: string[];
}

interface DomainPolicy {
  scoreCap: number;
  autonomy: Exclude<RemediationAutonomy, 'observe'>;
  risk: RemediationRisk;
  reason: string;
  blocker?: string;
}

/**
 * Operational priority answers "how much does this matter?". This table answers
 * the separate question "how much autonomy may an agent exercise while fixing
 * it?". High-impact signals deliberately receive *less* autonomy, not more.
 *
 * v1 never authorizes a provider/runtime mutation. The highest autonomous rail
 * is preparing a code PR; bounded executors can be added later behind their own
 * action-specific policy and verification gates.
 */
const DOMAIN_POLICY: Record<OperationsDomain, DomainPolicy> = {
  customers: {
    scoreCap: 30,
    autonomy: 'approval-required',
    risk: 'high',
    reason: 'customer-state changes have direct user impact',
    blocker: 'customer-state remediation requires human approval',
  },
  product: {
    scoreCap: 60,
    autonomy: 'auto-pr',
    risk: 'medium',
    reason: 'product fixes may be prepared as code changes but not auto-deployed',
  },
  costs: {
    scoreCap: 35,
    autonomy: 'approval-required',
    risk: 'medium',
    reason: 'cost and billing policy changes can alter spend',
    blocker: 'cost-policy remediation requires human approval',
  },
  social: {
    scoreCap: 60,
    autonomy: 'auto-pr',
    risk: 'medium',
    reason: 'social pipeline fixes may change externally visible publishing behavior',
  },
  jobs: {
    scoreCap: 80,
    autonomy: 'auto-pr',
    risk: 'low',
    reason: 'job failures are good candidates for bounded code fixes',
  },
  infra: {
    scoreCap: 25,
    autonomy: 'approval-required',
    risk: 'high',
    reason: 'runtime and infrastructure changes have broad blast radius',
    blocker: 'runtime or infrastructure mutation requires human approval',
  },
  errors: {
    scoreCap: 75,
    autonomy: 'auto-pr',
    risk: 'low',
    reason: 'error fixes are good candidates for bounded regression-backed PRs',
  },
  analytics: {
    scoreCap: 70,
    autonomy: 'auto-pr',
    risk: 'low',
    reason: 'analytics fixes are isolated from product transaction semantics',
  },
};

const RISK_RANK: Record<RemediationRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function assessRemediationSuitability(input: {
  signal: OperationalSignal;
  operationalPriorityScore?: number | null;
  evidenceGaps?: readonly RemediationEvidenceGap[];
}): RemediationAssessment {
  const priorityScore = input.operationalPriorityScore ?? null;
  const parsed = parseOperationalFingerprint(input.signal.fingerprint);

  if (input.signal.status === 'healthy') {
    return assessment({
      operationalPriorityScore: priorityScore,
      suitabilityScore: 0,
      autonomy: 'observe',
      risk: 'low',
      evidenceReady: true,
      reasons: ['healthy signals do not need remediation'],
      blockers: [],
    });
  }

  if (input.signal.status === 'unknown') {
    return assessment({
      operationalPriorityScore: priorityScore,
      suitabilityScore: 0,
      autonomy: 'observe',
      risk: 'medium',
      evidenceReady: false,
      reasons: ['unknown provider state is not evidence of a fixable incident'],
      blockers: ['operational evidence is unknown'],
    });
  }

  if (parsed?.kind === 'source-failure') {
    return assessment({
      operationalPriorityScore: priorityScore,
      suitabilityScore: 0,
      autonomy: 'observe',
      risk: 'medium',
      evidenceReady: false,
      reasons: ['the observer failed, so the underlying system state is unproven'],
      blockers: ['provider evidence is unavailable'],
    });
  }

  const policy = DOMAIN_POLICY[input.signal.domain];
  let suitabilityScore = policy.scoreCap;
  let autonomy: RemediationAutonomy = policy.autonomy;
  let risk = policy.risk;
  let evidenceReady = true;
  const reasons = [policy.reason];
  const blockers = policy.blocker ? [policy.blocker] : [];

  if (input.signal.status === 'critical') {
    suitabilityScore = Math.max(0, suitabilityScore - 10);
    reasons.push('critical impact reduces autonomous remediation headroom');
  }

  const affectedUsers = evidenceNumber(input.signal, 'affectedUsers');
  if (affectedUsers !== null && affectedUsers > 0) {
    suitabilityScore = Math.max(
      0,
      suitabilityScore - Math.min(25, Math.max(5, affectedUsers * 2)),
    );
    risk = higherRisk(risk, 'medium');
    reasons.push(`${Math.round(affectedUsers)} affected users increase blast radius`);
  }

  const aumAtRiskUsd = evidenceNumber(input.signal, 'aumAtRiskUsd');
  if (aumAtRiskUsd !== null && aumAtRiskUsd > 0) {
    suitabilityScore = Math.min(suitabilityScore, 15);
    autonomy = 'approval-required';
    risk = 'high';
    reasons.push('financial exposure requires a human-controlled remediation rail');
    blockers.push('AUM-at-risk incidents cannot be autonomously mutated');
  }

  if (input.signal.evidence['attemptsExhausted'] === true) {
    suitabilityScore = Math.min(100, suitabilityScore + 5);
    reasons.push('terminal retry state is deterministic remediation evidence');
  }

  const evidenceGaps = input.evidenceGaps ?? [];
  if (evidenceGaps.length > 0) {
    evidenceReady = false;
    suitabilityScore = Math.min(suitabilityScore, 10);
    autonomy = 'observe';
    risk = higherRisk(risk, 'medium');
    blockers.push(
      ...evidenceGaps.map((gap) => `${gap.source}: ${gap.reason}`),
    );
    reasons.push('unresolved evidence gaps block autonomous remediation');
  }

  return assessment({
    operationalPriorityScore: priorityScore,
    suitabilityScore,
    autonomy,
    risk,
    evidenceReady,
    reasons: unique(reasons),
    blockers: unique(blockers),
  });
}

function assessment(
  input: Omit<RemediationAssessment, 'policyVersion' | 'directMutationAllowed'>,
): RemediationAssessment {
  return {
    policyVersion: REMEDIATION_POLICY_VERSION,
    directMutationAllowed: false,
    ...input,
  };
}

function evidenceNumber(signal: OperationalSignal, key: string): number | null {
  const value = signal.evidence[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function higherRisk(
  left: RemediationRisk,
  right: RemediationRisk,
): RemediationRisk {
  return RISK_RANK[left] >= RISK_RANK[right] ? left : right;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

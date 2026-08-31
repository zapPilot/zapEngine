import type { OperationsSource } from '../../../../shared/types.js';

export type SignalInspectionStatus =
  | 'ok'
  | 'not-found'
  | 'unsupported'
  | 'unavailable';

export interface EvidenceGap {
  source: OperationsSource;
  reason: string;
}

export interface OperationalEntityRef {
  type:
    | 'workspace'
    | 'github-workflow'
    | 'github-run'
    | 'fly-app'
    | 'fly-process-group'
    | 'fly-machine'
    | 'sentry-project'
    | 'sentry-issue'
    | 'customer';
  id: string;
  url?: string | null;
}

/**
 * Deep, bounded evidence for one stable OperationalSignal fingerprint.
 *
 * This is intentionally not an arbitrary provider query result. Inspectors
 * expose only the fields an agent needs to explain an incident, and they keep
 * secrets / request metadata / user PII server-side.
 */
export interface SignalInspection {
  fingerprint: string;
  source: OperationsSource | null;
  status: SignalInspectionStatus;
  inspectedAt: string;
  summary: string;
  entities: OperationalEntityRef[];
  evidence: Record<string, unknown>;
  gaps: EvidenceGap[];
}

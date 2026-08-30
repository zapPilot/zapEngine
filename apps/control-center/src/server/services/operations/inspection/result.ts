import type { OperationsSource } from '../../../../shared/types.js';
import type { ControlCenterConfig } from '../../../config/env.js';
import type { ParsedOperationalFingerprint } from './fingerprint.js';
import type {
  OperationalEntityRef,
  SignalInspection,
} from './types.js';

export interface InspectorInput {
  config: ControlCenterConfig;
  fingerprint: string;
  parsed: ParsedOperationalFingerprint;
  inspectedAt: Date;
  fetchImpl: typeof fetch;
}

interface InspectionResultInput {
  fingerprint: string;
  source: OperationsSource | null;
  inspectedAt: Date;
  summary: string;
  entities?: OperationalEntityRef[];
  evidence?: Record<string, unknown>;
}

export function unsupportedInspection(
  input: InspectionResultInput,
): SignalInspection {
  return baseInspection(input, 'unsupported', []);
}

export function unavailableInspection(
  input: InspectionResultInput & {
    source: OperationsSource;
    reason: string;
  },
): SignalInspection {
  return baseInspection(input, 'unavailable', [
    { source: input.source, reason: input.reason },
  ]);
}

export function notFoundInspection(
  input: InspectionResultInput,
): SignalInspection {
  return baseInspection(input, 'not-found', []);
}

function baseInspection(
  input: InspectionResultInput,
  status: SignalInspection['status'],
  gaps: SignalInspection['gaps'],
): SignalInspection {
  return {
    fingerprint: input.fingerprint,
    source: input.source,
    status,
    inspectedAt: input.inspectedAt.toISOString(),
    summary: input.summary,
    entities: input.entities ?? [],
    evidence: input.evidence ?? {},
    gaps,
  };
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

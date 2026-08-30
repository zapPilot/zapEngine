import type { OperationsSource } from '../../../../shared/types.js';

import type { SignalInspection } from './types.js';

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function unsupported(
  input: { fingerprint: string; inspectedAt: Date },
  summary: string,
  source: OperationsSource | null,
): SignalInspection {
  return {
    fingerprint: input.fingerprint,
    source,
    status: 'unsupported',
    inspectedAt: input.inspectedAt.toISOString(),
    summary,
    entities: [],
    evidence: {},
    gaps: [],
  };
}

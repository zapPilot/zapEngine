import { describe, expect, it, vi } from 'vitest';
import type { OpsIncidentContext } from '../../../mcp/incident-context.js';
import { OPERATOR_CATALOG_NOTE } from './actions.js';
import { enrichOperatorContext } from './context.js';
import type { OperatorStore } from './store.js';

const packet = {
  incident: { fingerprint: 'github-actions:workflow/ci.yml' },
  primaryEvidence: { evidence: {} },
} as OpsIncidentContext;

function store(unavailable: boolean): OperatorStore {
  return {
    rpc: vi.fn(),
    history: unavailable
      ? vi.fn().mockRejectedValue(new Error('unavailable'))
      : vi.fn().mockResolvedValue([]),
    renderTargets: vi.fn().mockResolvedValue([]),
    runtime: vi.fn().mockResolvedValue([]),
  };
}

describe('operator context catalog', () => {
  it.each([false, true])(
    'explains runner scope when unavailable=%s',
    async (unavailable) => {
      const result = await enrichOperatorContext(packet, store(unavailable));
      expect(result.operator.note).toBe(OPERATOR_CATALOG_NOTE);
      expect(result.operator.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'patch-and-pr',
            executor: 'ops-operator-runner',
            allowed: false,
          }),
        ]),
      );
      expect(result.runtimeCorrelation.gaps.length).toBeGreaterThan(0);
    },
  );
});

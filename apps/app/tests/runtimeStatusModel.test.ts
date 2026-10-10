import { expect, it } from 'vitest';
import { CAPABILITY_STATUS } from '@zapengine/zap-pilot-story/status';
import {
  hostedRuntimeStatus,
  runtimeStatusModel,
  STRATEGY_PARTS,
  MACHINE_PARTS,
  WALLET_PARTS,
} from '@/integration/runtimeStatusModel';
it('counts exactly the canonical parts and keeps each status attached to its id', () => {
  const result = runtimeStatusModel();
  expect(result.total).toBe(Object.keys(CAPABILITY_STATUS).length);
  expect(result.counts).toEqual({
    live: 11,
    research: 1,
    'in-development': 3,
    planned: 9,
  });
  expect(result.parts.map((p) => p.id)).toEqual(Object.keys(CAPABILITY_STATUS));
  expect(Object.values(result.counts).reduce((a, b) => a + b, 0)).toBe(
    result.total,
  );
  for (const id of [...STRATEGY_PARTS, ...MACHINE_PARTS, ...WALLET_PARTS])
    expect(result.parts.find((p) => p.id === id)?.status).toBe(
      CAPABILITY_STATUS[id],
    );
});
it('hosted readiness is the least ready of reference evaluation and deposit planning, without inventing a part', () => {
  expect(hostedRuntimeStatus()).toBe('live');
  for (const status of ['research', 'in-development', 'planned'] as const) {
    expect(
      hostedRuntimeStatus({
        ...CAPABILITY_STATUS,
        'reference-strategy': status,
      }),
    ).toBe(status);
    expect(
      hostedRuntimeStatus({ ...CAPABILITY_STATUS, 'deposit-plans': status }),
    ).toBe(status);
  }
  expect(
    runtimeStatusModel({ ...CAPABILITY_STATUS, 'deposit-plans': 'planned' })
      .counts.planned,
  ).toBe(10);
});

import { afterEach, expect, it } from 'vitest';
import {
  CAPABILITIES,
  CAPABILITY_STATUSES,
  capabilityIds,
  capabilityTotal,
  isLive,
  runtimeStatus,
  statusCount,
  type CapabilityStatus,
} from './capabilities.js';
const original = Object.values(CAPABILITIES).map(
  (capability) => capability.status,
);
afterEach(() =>
  Object.values(CAPABILITIES).forEach((capability, i) => {
    (capability as { status: CapabilityStatus }).status = original[i]!;
  }),
);
it('derives all counts and shapes from the capability table', () => {
  expect(capabilityTotal()).toBe(24);
  expect(CAPABILITY_STATUSES.map(statusCount)).toEqual([11, 1, 3, 9]);
  expect(capabilityIds('device-agent-key')).toEqual(['device-agent-key']);
  expect(capabilityIds(['wallet-signing', 'device-agent-key'])).toEqual([
    'wallet-signing',
    'device-agent-key',
  ]);
  expect(isLive('device-agent-key')).toBe(true);
  expect(isLive('tokenized-equities')).toBe(false);
  expect(runtimeStatus()).toBe('in-development');
});
it('recomputes runtime readiness when capabilities change', () => {
  const set = (status: CapabilityStatus) =>
    Object.values(CAPABILITIES).forEach((capability) => {
      (capability as { status: CapabilityStatus }).status = status;
    });
  set('in-development');
  expect(runtimeStatus()).toBe('in-development');
  set('research');
  expect(runtimeStatus()).toBe('research');
  set('live');
  expect(runtimeStatus()).toBe('live');
});

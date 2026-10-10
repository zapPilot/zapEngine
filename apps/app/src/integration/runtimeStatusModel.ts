import {
  CAPABILITY_STATUS,
  CAPABILITY_STATUSES,
  type CapabilityStatus,
  type CapabilityId,
} from '@zapengine/zap-pilot-story/status';
export const RUNTIME_PARTS = Object.keys(CAPABILITY_STATUS) as CapabilityId[];
export const STRATEGY_PARTS = [
  'strategy-lab',
  'strategy-versioning',
  'strategy-publishing',
] as const;
export const MACHINE_PARTS = [
  'local-drift-check',
  'self-hosting',
  'unattended-runs',
  'snapshot-chain',
  'verifiable-rule',
] as const;
export const WALLET_PARTS = [
  'wallet-signing',
  'device-agent-key',
  'policy-engine',
  'withdrawals',
] as const;
export function runtimeStatusModel(
  statuses: Readonly<
    Record<CapabilityId, CapabilityStatus>
  > = CAPABILITY_STATUS,
) {
  const counts: Record<CapabilityStatus, number> = {
    live: 0,
    research: 0,
    'in-development': 0,
    planned: 0,
  };
  const parts = RUNTIME_PARTS.map((id) => {
    const status = statuses[id];
    counts[status] += 1;
    return { id, status };
  });
  return { parts, counts, total: parts.length };
}
export function hostedRuntimeStatus(
  statuses: Readonly<
    Record<CapabilityId, CapabilityStatus>
  > = CAPABILITY_STATUS,
): CapabilityStatus {
  const dependencies = [
    statuses['reference-strategy'],
    statuses['deposit-plans'],
  ];
  return [...CAPABILITY_STATUSES]
    .reverse()
    .find((status) => dependencies.includes(status))!;
}

export type RuntimeRowId =
  | (typeof STRATEGY_PARTS)[number]
  | (typeof MACHINE_PARTS)[number]
  | (typeof WALLET_PARTS)[number];

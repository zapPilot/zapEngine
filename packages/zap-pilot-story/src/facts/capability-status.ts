export const CAPABILITY_STATUSES = [
  'live',
  'research',
  'in-development',
  'planned',
] as const;

export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export const CAPABILITY_STATUS = {
  'reference-strategy': 'live',
  'market-signals': 'live',
  'portfolio-tracking': 'live',
  'dca-benchmark': 'live',
  'deposit-plans': 'live',
  'pre-sign-checks': 'live',
  'wallet-signing': 'live',
  'adapter-boundary': 'live',
  'no-zap-pilot-vault': 'live',
  'device-agent-key': 'live',
  'open-source': 'live',
  'verifiable-rule': 'research',
  withdrawals: 'in-development',
  'local-drift-check': 'in-development',
  'snapshot-chain': 'in-development',
  'rebalance-plans': 'planned',
  'strategy-versioning': 'planned',
  'strategy-lab': 'planned',
  'policy-engine': 'planned',
  'self-hosting': 'planned',
  'unattended-runs': 'planned',
  'tokenized-equities': 'planned',
  'strategy-publishing': 'planned',
  'ai-exception-layer': 'planned',
} as const satisfies Record<string, CapabilityStatus>;

export type CapabilityId = keyof typeof CAPABILITY_STATUS;

/**
 * Single source of truth for what the runtime can do today.
 *
 * Every public capability claim on the landing page, /pitch and the docs is
 * rendered from this table as a status badge. Copy references a capability by
 * id and never states liveness itself, so a claim cannot run ahead of the
 * status recorded here. the host positioning tests fences it.
 */

export const CAPABILITY_STATUSES = [
  'live',
  'research',
  'in-development',
  'planned',
] as const;

export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export const STATUS_LABEL = {
  live: 'Live',
  research: 'Research',
  'in-development': 'In development',
  planned: 'Planned',
} as const satisfies Record<CapabilityStatus, string>;

export const STATUS_DEFINITION = {
  live: 'Runs in production today.',
  research: 'A working experiment outside the production path.',
  'in-development': 'Partly built, not available to users yet.',
  planned: 'Not built yet.',
} as const satisfies Record<CapabilityStatus, string>;

interface Capability {
  readonly label: string;
  readonly status: CapabilityStatus;
  readonly detail: string;
}

export const CAPABILITIES = {
  'reference-strategy': {
    label: 'Reference strategy',
    status: 'live',
    detail:
      'DMA/FGI Portfolio Rules is evaluated daily on Zap Pilot-hosted servers and produces an advisory target allocation with a decision packet.',
  },
  'market-signals': {
    label: 'Market signals',
    status: 'live',
    detail:
      '200-day moving averages, crypto and US-equity Fear & Greed, and ETH/BTC, shown in the app next to each decision.',
  },
  'portfolio-tracking': {
    label: 'Portfolio tracking',
    status: 'live',
    detail:
      'Wallet positions are refreshed daily and shown in the app, read-only.',
  },
  'dca-benchmark': {
    label: 'DCA Classic benchmark',
    status: 'live',
    detail:
      'Starts half in BTC and moves the other half into BTC in equal daily amounts. Every reference-strategy backtest is measured against it.',
  },
  'deposit-plans': {
    label: 'Deposit plans',
    status: 'live',
    detail:
      'Deposits you start yourself go straight into positions you hold: the Spark USDC vault on Morpho (Base), GMX v2 GM pools (Arbitrum) and Hyperliquid HLP, routed through LI.FI.',
  },
  'pre-sign-checks': {
    label: 'Pre-sign checks',
    status: 'live',
    detail:
      'Every plan fails closed unless approvals are capped (never unlimited) and routed swaps meet a minimum received within 1% slippage; a batch that fails Tenderly simulation is rejected. HyperCore follow-up steps are not simulated.',
  },
  'wallet-signing': {
    label: 'Wallet signing',
    status: 'live',
    detail:
      'EIP-5792/7702 wallets sign one atomic batch; other wallets sign step by step. Privy wallets also sign an EIP-712 intent bound to the batch.',
  },
  'adapter-boundary': {
    label: 'Protocol adapters',
    status: 'live',
    detail:
      'Morpho, GMX v2, Hyperliquid and LI.FI adapters only encode actions that are already decided; they never choose a strategy.',
  },
  'no-zap-pilot-vault': {
    label: 'No Zap Pilot vault',
    status: 'live',
    detail:
      'There is no Zap Pilot vault or custody contract. The venues themselves are pooled third-party protocols with their own risks.',
  },
  'device-agent-key': {
    label: 'Device agent key',
    status: 'live',
    detail:
      'Hyperliquid deposits use an agent key created and stored on your device (browser storage on the web). You approve it once, and that approval may not expire.',
  },
  'open-source': {
    label: 'Open source',
    status: 'live',
    detail: 'MIT-licensed code and a public reference-strategy spec.',
  },
  'verifiable-rule': {
    label: 'On-chain rule check',
    status: 'research',
    detail:
      'One of the six rules (cross-down exit) is compiled to Vyper on Arbitrum Sepolia with a pinned runtime codehash, so a recorded exit can be recomputed.',
  },
  withdrawals: {
    label: 'Withdrawals',
    status: 'in-development',
    detail:
      'A withdrawal planning endpoint exists on the server; the app does not offer withdrawals yet.',
  },
  'local-drift-check': {
    label: 'Mac drift check',
    status: 'in-development',
    detail:
      'A Mac app that checks for drift every six hours and notifies you. It asks the hosted engine for the decision, never signs, and is not available to download yet.',
  },
  'snapshot-chain': {
    label: 'Snapshot chain',
    status: 'in-development',
    detail:
      'Daily IPFS snapshots linked into a chain. They are unsigned and track a single reference address.',
  },
  'rebalance-plans': {
    label: 'Rebalance plans',
    status: 'planned',
    detail:
      'Turn the gap between a strategy target and your positions into transactions you review and sign.',
  },
  'strategy-versioning': {
    label: 'Strategy versioning',
    status: 'planned',
    detail:
      'Versioned strategy configs you can hold fixed. Today the config is global and can change in place.',
  },
  'strategy-lab': {
    label: 'Strategy lab',
    status: 'planned',
    detail: 'Write your own rules and backtest them against DCA Classic.',
  },
  'policy-engine': {
    label: 'Policy engine',
    status: 'planned',
    detail:
      'Limits, allowlists and a kill switch you set, checked before anything is signed.',
  },
  'self-hosting': {
    label: 'Local runtime',
    status: 'planned',
    detail: 'Strategy evaluation and planning on hardware you control.',
  },
  'unattended-runs': {
    label: 'Unattended runs',
    status: 'planned',
    detail:
      'Rebalancing without you, only inside scoped on-chain permissions you can revoke.',
  },
  'tokenized-equities': {
    label: 'Tokenized S&P 500',
    status: 'planned',
    detail:
      'An adapter for the S&P 500 sleeve the reference strategy models. Deposits keep it at 0% until one exists.',
  },
  'strategy-publishing': {
    label: 'Strategy publishing',
    status: 'planned',
    detail: 'Publish a strategy with a verifiable track record.',
  },
  'ai-exception-layer': {
    label: 'AI exception layer',
    status: 'planned',
    detail:
      'An optional model that handles exceptions inside limits you set. No model decides allocations.',
  },
} as const satisfies Record<string, Capability>;

export type CapabilityId = keyof typeof CAPABILITIES;

/** Capability ids whose recorded status is `S`; status changes break callers. */
export type CapabilityIdWithStatus<S extends CapabilityStatus> = {
  [K in CapabilityId]: (typeof CAPABILITIES)[K]['status'] extends S ? K : never;
}[CapabilityId];

/** One id, or several ids that share a status and render as one badge. */
export type CapabilityRef<S extends CapabilityStatus = CapabilityStatus> =
  | CapabilityIdWithStatus<S>
  | readonly [CapabilityIdWithStatus<S>, ...CapabilityIdWithStatus<S>[]];

/** A shared badge must reference capabilities with the same recorded status. */
export type SharedCapabilityRef = {
  [S in CapabilityStatus]: CapabilityRef<S>;
}[CapabilityStatus];

export function capabilityIds(ref: CapabilityRef): readonly CapabilityId[] {
  return typeof ref === 'string' ? [ref] : ref;
}

/** Capabilities in table order: grouped by status, then declaration order. */
export function capabilitiesByStatus(status: CapabilityStatus): CapabilityId[] {
  return (Object.keys(CAPABILITIES) as CapabilityId[]).filter(
    (id) => CAPABILITIES[id].status === status,
  );
}

export const capabilityTotal = (): number => Object.keys(CAPABILITIES).length;
export const statusCount = (status: CapabilityStatus): number =>
  capabilitiesByStatus(status).length;
export const isLive = (id: CapabilityId): boolean =>
  CAPABILITIES[id].status === 'live';
/** Runtime availability is derived from its blocked capabilities. */
export function runtimeStatus(): CapabilityStatus {
  if (statusCount('planned') > 0 || statusCount('in-development') > 0) {
    return 'in-development';
  }
  if (statusCount('research') > 0) {
    return 'research';
  }
  return 'live';
}

import type {
  DepositPlan,
  PrivyPrepareSendCallsResponse,
  PrivySimulationApproval,
  PrivySimulationAssetChange,
  PrivySimulationCall,
  PrivySimulationContract,
  StrategyDepositPlan,
} from '@zapengine/types/api';
import {
  STRATEGY_DEPOSIT_ID,
  SUPPORTED_DEPOSIT_CHAINS,
} from '@zapengine/types/api';
import { formatTokenBaseUnits } from '@zapengine/app-core/utils';
import { describe, expect, it } from 'vitest';

import {
  approvalForCall,
  compactTokenAmount,
  confirmGate,
  confirmRiskHash,
  formatAddressOrUnknown,
  formatCountdown,
  formatInteger,
  getBlockingReason,
  partitionAssetChanges,
  resolveAddressTarget,
  resolveAssetCounterparty,
  resolveCallTarget,
  resolveRouteProtocols,
  signingActionLabel,
  simulationChainLabel,
  titleCase,
  verdictMeta,
} from '@/integration/simulationPreviewModel';

const NOW_MS = 1_800_000_000_000;
const WALLET = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x2222222222222222222222222222222222222222';
const TARGET = '0x3333333333333333333333333333333333333333';
const RISK_HASH = `0x${'ab'.repeat(32)}`;

const call: PrivySimulationCall = {
  index: 0,
  to: TARGET,
  data: '0x1234',
  value: '0',
  method: 'depositFor',
  status: 'succeeded',
  gasUsed: '21000',
  error: null,
};

const outgoing: PrivySimulationAssetChange = {
  callIndex: 0,
  direction: 'out',
  type: 'Transfer',
  from: WALLET,
  to: TARGET,
  token: {
    address: TOKEN,
    symbol: 'TKN',
    name: 'Token',
    decimals: 18,
    logoUrl: null,
  },
  rawAmount: '1234500000000000000',
  amount: '1.2345',
};

const incoming: PrivySimulationAssetChange = {
  ...outgoing,
  direction: 'in',
  from: TARGET,
  to: WALLET,
};

const approval: PrivySimulationApproval = {
  callIndex: 0,
  owner: WALLET,
  spender: TARGET,
  token: outgoing.token,
  rawAmount: '1000000000000000000',
  amount: '1',
  unlimited: false,
  simulatedSpendRaw: '500000000000000000',
  exceedsSimulatedSpend: true,
};

const contracts: PrivySimulationContract[] = [
  {
    address: TARGET,
    name: 'Verified Vault',
    callIndexes: [0],
  },
];

const STRATEGY_PLAN: StrategyDepositPlan = {
  kind: 'strategy',
  strategyId: STRATEGY_DEPOSIT_ID,
  totalUsd6: '100000000',
  allocations: [
    {
      id: 'morpho-base-usdc',
      label: 'Morpho Moonwell USDC',
      weightBps: 4000,
      chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
      protocol: 'morpho',
      fromToken: TOKEN,
      fromAmount: '40000000',
      toToken: TOKEN,
      toAmountMin: '39000000',
      gasUsd: '0.10',
      durationSec: 5,
    },
    {
      id: 'gmx-btc-usdc',
      label: 'GMX BTC/USDC',
      weightBps: 3000,
      chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
      protocol: 'gmx-v2',
      marketKey: 'btc-usdc',
      fromToken: TOKEN,
      fromAmount: '30000000',
      toToken: TOKEN,
      toAmountMin: '29000000',
      gasUsd: '0.10',
      durationSec: 5,
    },
    {
      id: 'gmx-eth-usdc',
      label: 'GMX ETH/USDC',
      weightBps: 3000,
      chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
      protocol: 'gmx-v2',
      marketKey: 'eth-usdc',
      fromToken: TOKEN,
      fromAmount: '30000000',
      toToken: TOKEN,
      toAmountMin: '29000000',
      gasUsd: '0.10',
      durationSec: 5,
    },
  ],
  executionGroups: [
    {
      id: 'base-morpho',
      chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
      fromToken: TOKEN,
      fromAmount: '40000000',
      approvals: [],
      calls: [],
      allocationIds: ['morpho-base-usdc'],
      gasUsd: '0.10',
    },
    {
      id: 'arbitrum-gmx',
      chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
      fromToken: TOKEN,
      fromAmount: '60000000',
      approvals: [],
      calls: [],
      allocationIds: ['gmx-btc-usdc', 'gmx-eth-usdc'],
      gasUsd: '0.20',
    },
  ],
  checkpoints: [
    {
      kind: 'mock-bridge',
      id: 'base-to-arbitrum',
      fromChainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
      toChainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
      afterGroupId: 'base-morpho',
      beforeGroupId: 'arbitrum-gmx',
      amountUsd6: '60000000',
      disclosure: 'Bridges Base proceeds to Arbitrum before GMX supply.',
    },
  ],
  totalGasUsd: '0.30',
};

/** Minimal single-chain deposit plan with one leg carrying the given protocol
 * (omitted entirely, not `undefined`, when the scenario needs no protocol). */
function singleChainPlan(protocol?: string): DepositPlan {
  return {
    legs: [
      {
        chainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
        kind: 'supply',
        toToken: TOKEN,
        fromAmount: '1000000',
        toAmountMin: '990000',
        gasUsd: '0.05',
        durationSec: 5,
        ...(protocol ? { protocol } : {}),
      },
    ],
    approvals: [],
    calls: [],
    totalGasUsd: '0.05',
    sourceChainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
  };
}

const GMX_BTC_USDC_MARKET = '0x47c031236e19d024b42f8AE6780E44A573170703';
const GMX_ETH_USDC_MARKET = '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336';
const GMX_BTC_BTC_MARKET = '0x7C11F78Ce78768518D743E81Fdfa2F860C6b9A77';
const GMX_ETH_ETH_MARKET = '0x450bb6774Dd8a756274E0ab4107953259d2ac541';

/** A single-chain deposit plan shaped like the real Arbitrum GMX v2 basket:
 * one leg per market, each funded by its own share of the total amount. */
function gmxBasketPlan(fromAmounts: readonly string[]): DepositPlan {
  const markets = [
    { toToken: GMX_BTC_BTC_MARKET, label: 'GMX BTC/BTC' },
    { toToken: GMX_ETH_ETH_MARKET, label: 'GMX ETH/ETH' },
    { toToken: GMX_BTC_USDC_MARKET, label: 'GMX BTC/USDC' },
    { toToken: GMX_ETH_USDC_MARKET, label: 'GMX ETH/USDC' },
  ];
  return {
    legs: markets.map(({ toToken, label }, index) => ({
      chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
      kind: 'supply',
      protocol: 'gmx-v2',
      label,
      toToken,
      fromAmount: fromAmounts[index]!,
      toAmountMin: '0',
      gasUsd: '0.10',
      durationSec: 60,
    })),
    approvals: [],
    calls: [],
    totalGasUsd: '0.40',
    sourceChainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
  };
}

function preview(
  overrides: Record<string, unknown> = {},
): PrivyPrepareSendCallsResponse {
  return {
    status: 'passed',
    chainId: 8453,
    walletAddress: WALLET,
    calls: [call],
    assetChanges: [outgoing],
    approvals: [approval],
    contracts,
    warnings: [],
    blockNumber: 123456,
    callGas: '21000',
    simulationIds: ['simulation-1'],
    shareUrls: [],
    simulationFingerprint: `0x${'1'.repeat(64)}`,
    riskHash: RISK_HASH,
    previewId: 'preview-1',
    batchHash: `0x${'2'.repeat(64)}`,
    typedDataPayload: {},
    expiresAt: NOW_MS + 300_000,
    authorizationPayload: 'authorization',
    requestExpiry: NOW_MS + 300_000,
    ...overrides,
  } as unknown as PrivyPrepareSendCallsResponse;
}

describe('simulation verdicts', () => {
  it('maps all four statuses to reader-facing tones and labels', () => {
    expect(verdictMeta(preview())).toEqual({
      label: 'All checks passed',
      tone: 'success',
    });
    expect(
      verdictMeta(
        preview({
          status: 'warning',
          warnings: [{ code: 'UNLIMITED_APPROVAL', message: 'Unlimited' }],
        }),
      ),
    ).toEqual({ label: 'Simulation ready', tone: 'success' });
    expect(verdictMeta('failed')).toEqual({
      label: 'Simulation failed',
      tone: 'error',
    });
    expect(verdictMeta('unavailable')).toEqual({
      label: 'Simulation unavailable',
      tone: 'neutral',
    });
  });

  it('only returns blocking detail for failed and unavailable previews', () => {
    expect(getBlockingReason(preview())).toBeNull();
    expect(
      getBlockingReason(
        preview({ status: 'failed', failureReason: 'execution reverted' }),
      ),
    ).toBe('execution reverted');
    expect(
      getBlockingReason(
        preview({
          status: 'unavailable',
          unavailableReason: 'Tenderly timed out',
        }),
      ),
    ).toBe('Tenderly timed out');
  });
});

describe('simulation evidence helpers', () => {
  it('partitions asset changes without changing their order', () => {
    expect(partitionAssetChanges([incoming, outgoing, incoming])).toEqual({
      incoming: [incoming, incoming],
      outgoing: [outgoing],
    });
  });

  it('uses contract names for call and spender labels', () => {
    expect(resolveCallTarget(call, contracts)).toBe('Verified Vault');
    expect(resolveAddressTarget(TARGET, contracts)).toBe('Verified Vault');
  });

  it('falls back to the short address when the review carries no name', () => {
    expect(resolveCallTarget(call, [{ ...contracts[0]!, name: null }])).toBe(
      '0x3333…3333',
    );
    expect(resolveAddressTarget(TARGET, [])).toBe('0x3333…3333');
  });

  it('finds the approval attached to a call index', () => {
    expect(approvalForCall(call, [approval])).toBe(approval);
    expect(approvalForCall(1, [approval])).toBeUndefined();
  });
});

describe('confirmGate', () => {
  it.each([
    {
      name: 'passed',
      value: preview(),
      options: {
        nowMs: NOW_MS,
        busy: false,
      },
      expected: { canConfirm: true, expired: false, reason: null },
    },
    {
      name: 'failed',
      value: preview({ status: 'failed', failureReason: 'reverted' }),
      options: {
        nowMs: NOW_MS,
        busy: false,
      },
      expected: {
        canConfirm: false,
        expired: false,
        reason: 'simulation-blocked',
      },
    },
    {
      name: 'unavailable',
      value: preview({
        status: 'unavailable',
        unavailableReason: 'timeout',
      }),
      options: {
        nowMs: NOW_MS,
        busy: false,
      },
      expected: {
        canConfirm: false,
        expired: false,
        reason: 'simulation-blocked',
      },
    },
    {
      name: 'busy',
      value: preview(),
      options: {
        nowMs: NOW_MS,
        busy: true,
      },
      expected: { canConfirm: false, expired: false, reason: 'busy' },
    },
    {
      name: 'warning',
      value: preview({
        status: 'warning',
        warnings: [{ code: 'UNLIMITED_APPROVAL', message: 'Unlimited' }],
      }),
      options: {
        nowMs: NOW_MS,
        busy: false,
      },
      expected: { canConfirm: true, expired: false, reason: null },
    },
  ])('handles the $name state', ({ value, options, expected }) => {
    expect(confirmGate(value, options)).toEqual(expected);
  });

  it('treats expiresAt as milliseconds and reserves a ten-second margin', () => {
    expect(
      confirmGate(preview({ expiresAt: NOW_MS + 10_001 }), {
        nowMs: NOW_MS,
        busy: false,
      }),
    ).toEqual({ canConfirm: true, expired: false, reason: null });
    expect(
      confirmGate(preview({ expiresAt: NOW_MS + 10_000 }), {
        nowMs: NOW_MS,
        busy: false,
      }),
    ).toEqual({
      canConfirm: false,
      expired: true,
      reason: 'preview-expired',
    });
  });
});

describe('simulation preview formatting', () => {
  it('formats exact and compact token values without floating-point loss', () => {
    expect(formatTokenBaseUnits('1234500000000000000', 18)).toBe('1.2345');
    expect(compactTokenAmount('9360528111924722', 18)).toBe('0.00936052');
    expect(formatTokenBaseUnits('42', 0)).toBe('42');
  });

  it('formats addresses, integer evidence, and millisecond countdowns', () => {
    expect(formatAddressOrUnknown(WALLET)).toBe('0x1111…1111');
    expect(formatAddressOrUnknown(null)).toBe('Unknown');
    expect(formatInteger('1234567')).toBe('1,234,567');
    expect(formatCountdown(NOW_MS + 70_000, NOW_MS)).toBe('1m 0s');
    expect(formatCountdown(NOW_MS + 10_000, NOW_MS)).toBe('Expired');
  });

  it('maps signing phases, confirmation hashes, chains, and method names', () => {
    expect(signingActionLabel('idle')).toBe('Sign & Send');
    expect(signingActionLabel('signingIntent')).toBe('Signing intent…');
    expect(signingActionLabel('authorizingBatch')).toBe('Authorizing batch…');
    expect(signingActionLabel('sendingBatch')).toBe('Sending batch…');
    expect(confirmRiskHash(preview())).toBeUndefined();
    expect(confirmRiskHash(preview({ status: 'warning' }))).toBe(RISK_HASH);
    expect(simulationChainLabel(8453)).toBe('Base');
    expect(simulationChainLabel(42161)).toBe('Arbitrum');
    expect(titleCase('depositFor')).toBe('Deposit For');
  });
});

describe('resolveRouteProtocols', () => {
  it('returns one chip per allocation for a multi-allocation execution group', () => {
    expect(resolveRouteProtocols(STRATEGY_PLAN, 'arbitrum-gmx')).toEqual([
      {
        id: 'gmx-btc-usdc',
        protocol: 'gmx-v2',
        label: 'GMX BTC/USDC',
        badge: '30%',
      },
      {
        id: 'gmx-eth-usdc',
        protocol: 'gmx-v2',
        label: 'GMX ETH/USDC',
        badge: '30%',
      },
    ]);
  });

  it('returns a single chip for a single-allocation execution group', () => {
    expect(resolveRouteProtocols(STRATEGY_PLAN, 'base-morpho')).toEqual([
      {
        id: 'morpho-base-usdc',
        protocol: 'morpho',
        label: 'Morpho Moonwell USDC',
        badge: '40%',
      },
    ]);
  });

  it('returns no chips when the groupId does not match any execution group', () => {
    expect(resolveRouteProtocols(STRATEGY_PLAN, 'unknown-group')).toEqual([]);
  });

  it('resolves the display label for a single-leg single-chain protocol', () => {
    expect(resolveRouteProtocols(singleChainPlan('morpho'), 'n/a')).toEqual([
      {
        id: `morpho-${TOKEN.toLowerCase()}-0`,
        protocol: 'morpho',
        label: 'Morpho Moonwell USDC',
        badge: '100%',
      },
    ]);
  });

  it('falls back to titleCase for an unrecognized single-chain protocol', () => {
    expect(
      resolveRouteProtocols(singleChainPlan('made-up-protocol'), 'n/a'),
    ).toEqual([
      {
        id: `made-up-protocol-${TOKEN.toLowerCase()}-0`,
        protocol: 'made-up-protocol',
        label: 'Made up protocol',
        badge: '100%',
      },
    ]);
  });

  it('returns one chip per market for the Arbitrum GMX v2 basket instead of collapsing to one', () => {
    const plan = gmxBasketPlan(['2500', '2500', '2500', '2500']);
    expect(resolveRouteProtocols(plan, 'n/a')).toEqual([
      {
        id: `gmx-v2-${GMX_BTC_BTC_MARKET.toLowerCase()}-0`,
        protocol: 'gmx-v2',
        label: 'GMX BTC/BTC',
        badge: '25%',
      },
      {
        id: `gmx-v2-${GMX_ETH_ETH_MARKET.toLowerCase()}-1`,
        protocol: 'gmx-v2',
        label: 'GMX ETH/ETH',
        badge: '25%',
      },
      {
        id: `gmx-v2-${GMX_BTC_USDC_MARKET.toLowerCase()}-2`,
        protocol: 'gmx-v2',
        label: 'GMX BTC/USDC',
        badge: '25%',
      },
      {
        id: `gmx-v2-${GMX_ETH_USDC_MARKET.toLowerCase()}-3`,
        protocol: 'gmx-v2',
        label: 'GMX ETH/USDC',
        badge: '25%',
      },
    ]);
  });

  it('shares the badge percentage proportionally when the basket splits unevenly', () => {
    const plan = gmxBasketPlan(['2501', '2500', '2500', '2499']);
    const badges = resolveRouteProtocols(plan, 'n/a').map((chip) => chip.badge);
    expect(badges).toEqual(['25%', '25%', '25%', '24.9%']);
  });

  it('returns no chips when the plan is undefined or no leg carries a protocol', () => {
    expect(resolveRouteProtocols(undefined, 'n/a')).toEqual([]);
    expect(resolveRouteProtocols(singleChainPlan(), 'n/a')).toEqual([]);
  });
});

describe('resolveAssetCounterparty', () => {
  it('resolves an outgoing change via the recipient (to)', () => {
    expect(resolveAssetCounterparty(outgoing, contracts)).toBe(
      'Verified Vault',
    );
  });

  it('resolves an incoming change via the sender (from)', () => {
    expect(resolveAssetCounterparty(incoming, contracts)).toBe(
      'Verified Vault',
    );
  });

  it('falls back to a formatted short address when no contract matches the counterparty', () => {
    const outgoingToWallet: PrivySimulationAssetChange = {
      ...outgoing,
      to: WALLET,
    };
    expect(resolveAssetCounterparty(outgoingToWallet, contracts)).toBe(
      '0x1111…1111',
    );

    const incomingFromWallet: PrivySimulationAssetChange = {
      ...incoming,
      from: WALLET,
    };
    expect(resolveAssetCounterparty(incomingFromWallet, contracts)).toBe(
      '0x1111…1111',
    );
  });

  it('returns Unknown when the relevant address is null', () => {
    const outgoingWithoutRecipient: PrivySimulationAssetChange = {
      ...outgoing,
      to: null,
    };
    expect(resolveAssetCounterparty(outgoingWithoutRecipient, contracts)).toBe(
      'Unknown',
    );

    const incomingWithoutSender: PrivySimulationAssetChange = {
      ...incoming,
      from: null,
    };
    expect(resolveAssetCounterparty(incomingWithoutSender, contracts)).toBe(
      'Unknown',
    );
  });
});

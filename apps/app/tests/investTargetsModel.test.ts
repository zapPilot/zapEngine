import { describe, expect, it } from 'vitest';

import {
  ARBITRUM_DEPOSIT_TOKENS,
  BASE_DEPOSIT_TOKENS,
  ETHEREUM_DEPOSIT_TOKENS,
} from '@/integration/depositTokens';
import {
  bpsToPercentInput,
  buildStageDrafts,
  DEFAULT_TARGET_ALLOCATIONS,
  gmxBasketBudgetTooSmall,
  hlpIngressFor,
  HLP_FUNDING_CANDIDATES,
  INVEST_POSITIONS,
  isValidTargetAllocation,
  normalizePercentInput,
  percentInputToBps,
  requiredChainsUnavailable,
  selectHlpFundingSource,
  stageDraftRequest,
  stageDraftsKey,
  stageLabel,
  targetMaxTotalUsd,
  targetMinimumUsd6,
  targetUsd6Shares,
  type TargetAllocation,
} from '@/integration/investTargetsModel';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';

const USER = '0x1111111111111111111111111111111111111111' as const;
const BASE_USDC = BASE_DEPOSIT_TOKENS[0];
const BASE_ETH = BASE_DEPOSIT_TOKENS[1];
const ARBITRUM_USDC = ARBITRUM_DEPOSIT_TOKENS[0];
const ARBITRUM_ETH = ARBITRUM_DEPOSIT_TOKENS[2];
const ETHEREUM_USDC = ETHEREUM_DEPOSIT_TOKENS[0];

function row(params: {
  chainId: 1 | 8453 | 42161;
  symbol: 'USDC' | 'USDT' | 'ETH';
  balance: string;
  balanceBaseUnits: string;
  usdValue: number | null;
  usdPrice: number | null;
}): ChainTokenBalanceRow {
  const chain =
    params.chainId === 8453
      ? 'base'
      : params.chainId === 42161
        ? 'arbitrum'
        : 'ethereum';
  return {
    id: `${params.chainId}:${params.symbol}`,
    chain,
    chainLabel: chain,
    chainId: params.chainId,
    tokenAddress: null,
    decimals: params.symbol === 'ETH' ? 18 : 6,
    balance: params.balance,
    balanceBaseUnits: params.balanceBaseUnits,
    usdValue: params.usdValue,
    usdPrice: params.usdPrice,
    token: { symbol: params.symbol, name: params.symbol },
  };
}

function usdcRow(chainId: 1 | 8453 | 42161, amount: number) {
  return row({
    chainId,
    symbol: 'USDC',
    balance: String(amount),
    balanceBaseUnits: String(Math.round(amount * 1_000_000)),
    usdValue: amount,
    usdPrice: 1,
  });
}

function ethRow(chainId: 1 | 8453 | 42161, eth: number, price: number | null) {
  return row({
    chainId,
    symbol: 'ETH',
    balance: String(eth),
    balanceBaseUnits: String(BigInt(Math.round(eth * 1e6)) * 10n ** 12n),
    usdValue: price === null ? null : eth * price,
    usdPrice: price,
  });
}

function allocation(
  morpho: number,
  gmx: number,
  hlp: number,
): TargetAllocation[] {
  return [
    { positionId: 'morpho-base', weightBps: morpho },
    { positionId: 'gmx-arbitrum', weightBps: gmx },
    { positionId: 'hlp', weightBps: hlp },
  ];
}

describe('INVEST_POSITIONS', () => {
  it('lists the destinations in execution order with their own minimums', () => {
    expect(INVEST_POSITIONS.map((position) => position.id)).toEqual([
      'morpho-base',
      'gmx-arbitrum',
      'hlp',
    ]);
    expect(INVEST_POSITIONS.map((position) => position.minUsd6)).toEqual([
      10_000n,
      1_000_000n,
      10_000_000n,
    ]);
  });

  it('defaults to a 40/35/25 mix that sums to 100%', () => {
    expect(isValidTargetAllocation(DEFAULT_TARGET_ALLOCATIONS)).toBe(true);
    expect(DEFAULT_TARGET_ALLOCATIONS.map((entry) => entry.weightBps)).toEqual([
      4_000, 3_500, 2_500,
    ]);
  });
});

describe('isValidTargetAllocation', () => {
  it('rejects weights that do not total 100%', () => {
    expect(isValidTargetAllocation(allocation(4_000, 3_500, 2_400))).toBe(
      false,
    );
  });

  it('rejects fractional basis points and out-of-range weights', () => {
    expect(isValidTargetAllocation(allocation(4_000.5, 3_499.5, 2_500))).toBe(
      false,
    );
    expect(isValidTargetAllocation(allocation(-1_000, 4_500, 6_500))).toBe(
      false,
    );
  });

  it('rejects a duplicated or missing destination', () => {
    expect(
      isValidTargetAllocation([
        { positionId: 'hlp', weightBps: 5_000 },
        { positionId: 'hlp', weightBps: 5_000 },
        { positionId: 'morpho-base', weightBps: 0 },
      ]),
    ).toBe(false);
    expect(
      isValidTargetAllocation([{ positionId: 'hlp', weightBps: 10_000 }]),
    ).toBe(false);
  });
});

describe('targetMinimumUsd6', () => {
  it("is driven by HLP's $10 floor at the default 25% weight", () => {
    expect(targetMinimumUsd6(DEFAULT_TARGET_ALLOCATIONS)).toBe(40_000_000n);
  });

  it('falls back to each destination on its own', () => {
    expect(targetMinimumUsd6(allocation(10_000, 0, 0))).toBe(10_000n);
    expect(targetMinimumUsd6(allocation(0, 10_000, 0))).toBe(1_000_000n);
    expect(targetMinimumUsd6(allocation(0, 0, 10_000))).toBe(10_000_000n);
  });

  it('is zero for an invalid allocation rather than guessing', () => {
    expect(targetMinimumUsd6(allocation(4_000, 3_500, 2_400))).toBe(0n);
  });
});

describe('targetUsd6Shares', () => {
  it('gives the rounding remainder to the last funded destination', () => {
    const shares = targetUsd6Shares('100000001', DEFAULT_TARGET_ALLOCATIONS);
    expect(shares).toEqual({
      'morpho-base': 40_000_000n,
      'gmx-arbitrum': 35_000_000n,
      hlp: 25_000_001n,
    });
  });

  it('excludes zero-weight destinations entirely', () => {
    expect(targetUsd6Shares('50000000', allocation(0, 4_000, 6_000))).toEqual({
      'morpho-base': 0n,
      'gmx-arbitrum': 20_000_000n,
      hlp: 30_000_000n,
    });
  });

  it('returns null for a zero total or an invalid allocation', () => {
    expect(targetUsd6Shares('0', DEFAULT_TARGET_ALLOCATIONS)).toBeNull();
    expect(targetUsd6Shares('100', allocation(1, 1, 1))).toBeNull();
  });
});

describe('hlpIngressFor', () => {
  it('routes native Arbitrum USDC through Bridge2 and everything else via LI.FI', () => {
    expect(hlpIngressFor(ARBITRUM_USDC)).toBe('bridge2');
    expect(hlpIngressFor(BASE_USDC)).toBe('lifi');
    expect(hlpIngressFor(ETHEREUM_USDC)).toBe('lifi');
    expect(hlpIngressFor(ARBITRUM_ETH)).toBe('lifi');
  });

  it('offers only USDC and native ETH, the tokens the invest schema accepts', () => {
    expect(
      HLP_FUNDING_CANDIDATES.every((token) =>
        ['USDC', 'ETH'].includes(token.symbol),
      ),
    ).toBe(true);
    expect(HLP_FUNDING_CANDIDATES[0]).toBe(ARBITRUM_USDC);
  });
});

describe('selectHlpFundingSource', () => {
  const shares = {
    'morpho-base': 40_000_000n,
    'gmx-arbitrum': 35_000_000n,
    hlp: 25_000_000n,
  };

  it('prefers Arbitrum USDC when it covers the share on its own', () => {
    const funding = selectHlpFundingSource({
      shares,
      baseFundingToken: BASE_USDC,
      arbitrumFundingToken: ARBITRUM_ETH,
      rows: [usdcRow(42161, 100), usdcRow(8453, 100)],
    });
    expect(funding?.token).toBe(ARBITRUM_USDC);
    expect(funding?.ingress).toBe('bridge2');
    expect(funding?.fromAmount).toBe('25000000');
  });

  it('subtracts the GMX reservation from a shared Arbitrum USDC balance', () => {
    const funding = selectHlpFundingSource({
      shares,
      baseFundingToken: BASE_USDC,
      arbitrumFundingToken: ARBITRUM_USDC,
      rows: [usdcRow(42161, 50), usdcRow(8453, 100)],
    });
    // 50 spendable − 35 reserved for GMX = 15 < the 25 HLP share.
    expect(funding?.token).toBe(BASE_USDC);
    expect(funding?.ingress).toBe('lifi');
    expect(funding?.reservedUsd6).toBe(40_000_000n);
  });

  it('skips an ETH candidate with no live quote', () => {
    const funding = selectHlpFundingSource({
      shares,
      baseFundingToken: BASE_ETH,
      arbitrumFundingToken: ARBITRUM_ETH,
      rows: [ethRow(8453, 1, null), usdcRow(1, 100)],
    });
    expect(funding?.token).toBe(ETHEREUM_USDC);
  });

  it('prefers Ethereum USDC over Base ETH', () => {
    const funding = selectHlpFundingSource({
      shares,
      baseFundingToken: BASE_USDC,
      arbitrumFundingToken: ARBITRUM_USDC,
      rows: [usdcRow(1, 100), ethRow(8453, 5, 3_000)],
    });
    expect(funding?.token).toBe(ETHEREUM_USDC);
  });

  it('returns null when no single source covers the share', () => {
    expect(
      selectHlpFundingSource({
        shares,
        baseFundingToken: BASE_USDC,
        arbitrumFundingToken: ARBITRUM_USDC,
        rows: [usdcRow(8453, 10), usdcRow(42161, 10)],
      }),
    ).toBeNull();
  });
});

describe('buildStageDrafts', () => {
  const rows = [usdcRow(8453, 1_000), usdcRow(42161, 1_000)];

  it('freezes one stage per funded destination in execution order', () => {
    const drafts = buildStageDrafts({
      totalUsd6: '100000000',
      allocations: DEFAULT_TARGET_ALLOCATIONS,
      baseFundingToken: BASE_USDC,
      arbitrumFundingToken: ARBITRUM_USDC,
      rows,
    });

    expect(drafts?.map((draft) => draft.positionId)).toEqual([
      'morpho-base',
      'gmx-arbitrum',
      'hlp',
    ]);
    expect(drafts?.map((draft) => draft.fromAmount)).toEqual([
      '40000000',
      '35000000',
      '25000000',
    ]);
    expect(drafts?.[2]).toMatchObject({ ingress: 'bridge2' });
  });

  it('converts an ETH funding source with conservative integer math', () => {
    const drafts = buildStageDrafts({
      totalUsd6: '100000000',
      allocations: allocation(10_000, 0, 0),
      baseFundingToken: BASE_ETH,
      arbitrumFundingToken: ARBITRUM_USDC,
      rows: [ethRow(8453, 1, 2_000)],
    });
    expect(drafts?.[0]?.fromAmount).toBe('50000000000000000');
  });

  it('returns null when no wallet source can fund the HLP share', () => {
    expect(
      buildStageDrafts({
        totalUsd6: '100000000',
        allocations: DEFAULT_TARGET_ALLOCATIONS,
        baseFundingToken: BASE_USDC,
        arbitrumFundingToken: ARBITRUM_USDC,
        rows: [],
      }),
    ).toBeNull();
  });

  it('returns null when an ETH funding source has no live quote', () => {
    expect(
      buildStageDrafts({
        totalUsd6: '100000000',
        allocations: allocation(10_000, 0, 0),
        baseFundingToken: BASE_ETH,
        arbitrumFundingToken: ARBITRUM_USDC,
        rows: [ethRow(8453, 1, null)],
      }),
    ).toBeNull();
  });
});

describe('stageDraftRequest', () => {
  const rows = [usdcRow(8453, 1_000), usdcRow(42161, 1_000), usdcRow(1, 1_000)];

  it('sends Morpho to the Base split and GMX to the basket endpoint', () => {
    const drafts = buildStageDrafts({
      totalUsd6: '100000000',
      allocations: DEFAULT_TARGET_ALLOCATIONS,
      baseFundingToken: BASE_USDC,
      arbitrumFundingToken: ARBITRUM_USDC,
      rows,
    })!;

    expect(stageDraftRequest(drafts[0]!, USER)).toEqual({
      kind: 'invest',
      userAddress: USER,
      fromToken: BASE_USDC.depositAddress,
      fromAmount: '40000000',
      sourceChainId: 8453,
      split: { '8453': 1 },
    });
    expect(stageDraftRequest(drafts[1]!, USER)).toEqual({
      kind: 'gmx-v2-basket',
      userAddress: USER,
      fromToken: ARBITRUM_USDC.depositAddress,
      amount: '35000000',
    });
  });

  it('names HyperCore as the only split for an Ethereum-funded HLP stage', () => {
    const drafts = buildStageDrafts({
      totalUsd6: '100000000',
      allocations: allocation(0, 0, 10_000),
      baseFundingToken: BASE_ETH,
      arbitrumFundingToken: ARBITRUM_ETH,
      rows: [usdcRow(1, 1_000)],
    })!;

    expect(drafts[0]).toMatchObject({ ingress: 'lifi' });
    expect(stageDraftRequest(drafts[0]!, USER)).toEqual({
      kind: 'invest',
      userAddress: USER,
      fromToken: ETHEREUM_USDC.depositAddress,
      fromAmount: '100000000',
      sourceChainId: 1,
      split: { '1337': 1 },
    });
  });

  it('keys a frozen stage set by every executable field', () => {
    const drafts = buildStageDrafts({
      totalUsd6: '100000000',
      allocations: allocation(10_000, 0, 0),
      baseFundingToken: BASE_USDC,
      arbitrumFundingToken: ARBITRUM_USDC,
      rows,
    })!;
    expect(stageDraftsKey(drafts)).toBe(
      `morpho-base:8453:${BASE_USDC.depositAddress}:100000000:100000000`,
    );
    expect(stageDraftsKey([])).toBe('');
  });

  it('labels each stage by its destination and HLP route', () => {
    const drafts = buildStageDrafts({
      totalUsd6: '100000000',
      allocations: DEFAULT_TARGET_ALLOCATIONS,
      baseFundingToken: BASE_USDC,
      arbitrumFundingToken: ARBITRUM_USDC,
      rows,
    })!;
    expect(drafts.map(stageLabel)).toEqual([
      'Morpho · Base',
      'GMX · Arbitrum',
      'HLP · Arbitrum USDC → Hyperliquid Bridge2',
    ]);
  });
});

describe('targetMaxTotalUsd', () => {
  it('caps by the tightest funded destination', () => {
    expect(
      targetMaxTotalUsd({
        allocations: allocation(4_000, 6_000, 0),
        baseFundingToken: BASE_USDC,
        arbitrumFundingToken: ARBITRUM_USDC,
        rows: [usdcRow(8453, 40), usdcRow(42161, 30)],
      }),
    ).toBe(50);
  });

  it('counts a shared HLP source once by combining its weights', () => {
    expect(
      targetMaxTotalUsd({
        allocations: allocation(0, 5_000, 5_000),
        baseFundingToken: BASE_USDC,
        arbitrumFundingToken: ARBITRUM_USDC,
        rows: [usdcRow(42161, 100)],
      }),
    ).toBe(100);
  });

  it('is null when a funded destination has no live price', () => {
    expect(
      targetMaxTotalUsd({
        allocations: DEFAULT_TARGET_ALLOCATIONS,
        baseFundingToken: BASE_ETH,
        arbitrumFundingToken: ARBITRUM_USDC,
        rows: [ethRow(8453, 1, null), usdcRow(42161, 100)],
      }),
    ).toBeNull();
  });
});

describe('requiredChainsUnavailable', () => {
  it('only reports chains a funded destination actually needs', () => {
    expect(
      requiredChainsUnavailable(allocation(0, 10_000, 0), ['base'], false),
    ).toBe(false);
    expect(
      requiredChainsUnavailable(allocation(10_000, 0, 0), ['base'], false),
    ).toBe(true);
    expect(
      requiredChainsUnavailable(
        DEFAULT_TARGET_ALLOCATIONS,
        ['arbitrum'],
        false,
      ),
    ).toBe(true);
    expect(
      requiredChainsUnavailable(DEFAULT_TARGET_ALLOCATIONS, [], true),
    ).toBe(true);
  });
});

describe('gmxBasketBudgetTooSmall', () => {
  it('rejects an ETH budget that the four keeper fees would consume', () => {
    const base = {
      positionId: 'gmx-arbitrum' as const,
      weightBps: 10_000,
      usd6: '1000000',
      sourceToken: ARBITRUM_ETH,
    };
    expect(
      gmxBasketBudgetTooSmall({ ...base, fromAmount: '4000000000000000' }),
    ).toBe(true);
    expect(
      gmxBasketBudgetTooSmall({ ...base, fromAmount: '4000000000000001' }),
    ).toBe(false);
    expect(
      gmxBasketBudgetTooSmall({
        ...base,
        sourceToken: ARBITRUM_USDC,
        fromAmount: '1',
      }),
    ).toBe(false);
  });
});

describe('percentage helpers', () => {
  it('keeps a half-typed percentage editable and clamps at 100', () => {
    expect(normalizePercentInput('12.')).toBe('12.');
    expect(normalizePercentInput('12.345')).toBe('12.34');
    expect(normalizePercentInput('150')).toBe('100');
    expect(normalizePercentInput('a')).toBe('');
  });

  it('round-trips percentages through basis points', () => {
    expect(percentInputToBps('12.5')).toBe(1_250);
    expect(percentInputToBps('')).toBe(0);
    expect(percentInputToBps('.')).toBe(0);
    expect(bpsToPercentInput(1_250)).toBe('12.5');
    expect(bpsToPercentInput(4_000)).toBe('40');
  });
});

import { describe, expect, it } from 'vitest';

import {
  amountInputToUsd6,
  amountUsdFromInput,
  buildSingleChainFundingDraft,
  buildStrategyFundingOptions,
  fundingTokenAmountFromUsd,
  maxUsdAmountInput,
  minimumDepositUsd6ForScope,
  MIN_STRATEGY_DEPOSIT_USD6,
  normalizeAmountInput,
  quickAmountUsdInput,
  requiredChainUnavailableForScope,
  singleChainFromAmount,
  spendableUsdForFundingToken,
  strategyMaxTotalUsd,
} from '@/integration/investAmountModel';
import {
  ARBITRUM_DEPOSIT_TOKENS,
  BASE_DEPOSIT_TOKENS,
  DEFAULT_ARBITRUM_FUNDING_TOKEN,
} from '@/integration/depositTokens';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';
import { formatTokenBalance } from '@/lib/format';

function row(
  chainId: 8453 | 42161,
  symbol: 'USDC' | 'USDT' | 'ETH',
  usdValue: number | null,
  balanceBaseUnits: string,
  usdPrice: number | null,
): ChainTokenBalanceRow {
  return {
    id: `${chainId}:${symbol}`,
    chain: chainId === 8453 ? 'base' : 'arbitrum',
    chainLabel: chainId === 8453 ? 'Base' : 'Arbitrum',
    chainId,
    tokenAddress: null,
    decimals: symbol === 'ETH' ? 18 : 6,
    balance: symbol === 'ETH' ? '1' : String(usdValue ?? 0),
    balanceBaseUnits,
    usdValue,
    usdPrice,
    token: {
      symbol,
      name: symbol,
      iconBg: '#000000',
      glyph: '$',
      iconSrc: '',
    },
  };
}

describe('Invest amount helpers', () => {
  it('parses grouped USD input and rejects an empty amount', () => {
    expect(amountUsdFromInput('1,000')).toBe(1000);
    expect(amountUsdFromInput('0')).toBeNull();
  });

  it('normalizes direct keyboard amount input while preserving decimals', () => {
    expect(normalizeAmountInput('$1000111')).toBe('1,000,111');
    expect(normalizeAmountInput('001234.50')).toBe('1,234.50');
    expect(normalizeAmountInput('12.3.4')).toBe('12.34');
    expect(normalizeAmountInput('1.123456789')).toBe('1.123456');
    expect(normalizeAmountInput('')).toBe('');
  });

  it('floors strategy Max to USD6 precision without overspending', () => {
    expect(maxUsdAmountInput(0.006)).toBe('0.006');
    expect(maxUsdAmountInput(0.0069999999)).toBe('0.006999');
    expect(maxUsdAmountInput(12.3456789)).toBe('12.345678');
    expect(maxUsdAmountInput(0.0000009)).toBe('');
  });

  it('derives quick-amount chip values from capacity without overspending', () => {
    expect(quickAmountUsdInput(null, 10_000)).toBe('');
    expect(quickAmountUsdInput(0, 5_000)).toBe('');
    expect(quickAmountUsdInput(100, 2_500)).toBe('25');
    expect(quickAmountUsdInput(100, 7_500)).toBe('75');
    expect(quickAmountUsdInput(1_234.5678912, 5_000)).toBe('617.283945');
    expect(quickAmountUsdInput(12.3456789, 10_000)).toBe(
      maxUsdAmountInput(12.3456789),
    );
    expect(quickAmountUsdInput(100_000, 10_000)).toBe('100,000');
  });

  it('converts USD input to exact 6-decimal base units', () => {
    expect(amountInputToUsd6('1,234.5678919')).toBe('1234567891');
    expect(amountInputToUsd6('0.000001')).toBe('1');
  });

  it('uses scope-specific minimum deposit floors', () => {
    expect(
      BigInt(amountInputToUsd6('0.009999')) >=
        minimumDepositUsd6ForScope('base'),
    ).toBe(false);
    expect(
      BigInt(amountInputToUsd6('0.01')) >= minimumDepositUsd6ForScope('base'),
    ).toBe(true);
    expect(
      BigInt(amountInputToUsd6('0.999999')) >=
        minimumDepositUsd6ForScope('arbitrum'),
    ).toBe(false);
    expect(
      BigInt(amountInputToUsd6('1')) >= minimumDepositUsd6ForScope('arbitrum'),
    ).toBe(true);
    expect(
      BigInt(amountInputToUsd6('9.999999')) >=
        minimumDepositUsd6ForScope('both'),
    ).toBe(false);
    expect(minimumDepositUsd6ForScope('both')).toBe(MIN_STRATEGY_DEPOSIT_USD6);
    expect(
      BigInt(amountInputToUsd6('10')) >= minimumDepositUsd6ForScope('both'),
    ).toBe(true);
  });

  it('shows allocation token amounts with a stablecoin display fallback', () => {
    expect(
      fundingTokenAmountFromUsd(100, 4_000, BASE_DEPOSIT_TOKENS[0], null),
    ).toBe(40);
    expect(
      fundingTokenAmountFromUsd(100, 4_000, BASE_DEPOSIT_TOKENS[1], null),
    ).toBeNull();
  });

  it('sorts positive token balances first and caps Max by both chains', () => {
    const rows = [
      row(8453, 'USDC', 40, '40000000', 1),
      row(42161, 'USDC', 30, '30000000', 1),
      row(42161, 'USDT', 0, '0', 1),
    ];
    const arbitrumOptions = buildStrategyFundingOptions(
      ARBITRUM_DEPOSIT_TOKENS,
      rows,
    );
    expect(arbitrumOptions[0]!.token.symbol).toBe('USDC');
    expect(
      strategyMaxTotalUsd({
        base: { token: BASE_DEPOSIT_TOKENS[0], balance: rows[0]! },
        arbitrum: {
          token: ARBITRUM_DEPOSIT_TOKENS[0],
          balance: rows[1]!,
        },
      }),
    ).toBe(50);

    const unpricedBaseEth = row(8453, 'ETH', null, '1000000000000000000', null);
    expect(
      strategyMaxTotalUsd({
        base: { token: BASE_DEPOSIT_TOKENS[1], balance: unpricedBaseEth },
        arbitrum: {
          token: ARBITRUM_DEPOSIT_TOKENS[0],
          balance: rows[1]!,
        },
      }),
    ).toBeNull();
  });

  it('uses only the active chain for single-chain Max capacity', () => {
    const baseUsdc = row(8453, 'USDC', 40, '40000000', 1);
    const baseEth = row(8453, 'ETH', 2_000, '1000000000000000000', 2_000);
    expect(spendableUsdForFundingToken(baseUsdc, BASE_DEPOSIT_TOKENS[0])).toBe(
      40,
    );
    expect(spendableUsdForFundingToken(baseEth, BASE_DEPOSIT_TOKENS[1])).toBe(
      1_994,
    );
  });

  it('formats invalid token balances as zero instead of NaN', () => {
    expect(formatTokenBalance('not-a-number', 'USDC', 'loaded')).toBe('0 USDC');
    expect(formatTokenBalance('1.23456789', 'ETH', 'loaded')).toBe(
      '1.234568 ETH',
    );
  });

  it('ignores inactive-chain balance failures in single-chain scopes', () => {
    expect(requiredChainUnavailableForScope('base', ['arbitrum'], false)).toBe(
      false,
    );
    expect(requiredChainUnavailableForScope('base', ['base'], false)).toBe(
      true,
    );
    expect(requiredChainUnavailableForScope('arbitrum', ['base'], false)).toBe(
      false,
    );
    expect(requiredChainUnavailableForScope('both', ['arbitrum'], false)).toBe(
      true,
    );
    expect(requiredChainUnavailableForScope('base', [], true)).toBe(true);
  });

  it('freezes Base USDC directly and Base ETH with conservative integer math', () => {
    expect(
      singleChainFromAmount({
        totalUsd6: '10000000',
        token: BASE_DEPOSIT_TOKENS[0],
        usdPrice: null,
      }),
    ).toBe('10000000');
    expect(
      singleChainFromAmount({
        totalUsd6: '10000000',
        token: BASE_DEPOSIT_TOKENS[1],
        usdPrice: 2_000,
      }),
    ).toBe('5000000000000000');

    const roundedDownWei = singleChainFromAmount({
      totalUsd6: '10000000',
      token: BASE_DEPOSIT_TOKENS[1],
      usdPrice: 2_000.0000001,
    });
    expect(roundedDownWei).not.toBeNull();
    expect(BigInt(roundedDownWei!)).toBeLessThan(5_000_000_000_000_000n);
    expect(
      singleChainFromAmount({
        totalUsd6: '10000000',
        token: BASE_DEPOSIT_TOKENS[1],
        usdPrice: null,
      }),
    ).toBeNull();
  });

  it('builds user-address-free frozen drafts for each single-chain route', () => {
    expect(
      buildSingleChainFundingDraft({
        scope: 'base',
        totalUsd6: '10000000',
        baseFundingToken: BASE_DEPOSIT_TOKENS[1],
        baseUsdPrice: 2_000,
        arbitrumFundingToken: DEFAULT_ARBITRUM_FUNDING_TOKEN,
        arbitrumUsdPrice: null,
      }),
    ).toEqual({
      scope: 'base',
      chainId: 8453,
      fromToken: BASE_DEPOSIT_TOKENS[1].depositAddress,
      fromAmount: '5000000000000000',
    });
    expect(
      buildSingleChainFundingDraft({
        scope: 'arbitrum',
        totalUsd6: '10000000',
        baseFundingToken: BASE_DEPOSIT_TOKENS[1],
        baseUsdPrice: null,
        arbitrumFundingToken: DEFAULT_ARBITRUM_FUNDING_TOKEN,
        arbitrumUsdPrice: 1,
      }),
    ).toEqual({
      scope: 'arbitrum',
      chainId: 42161,
      fromToken: DEFAULT_ARBITRUM_FUNDING_TOKEN.depositAddress,
      fromAmount: '10000000',
      marketKey: 'btc-usdc',
    });
    expect(
      buildSingleChainFundingDraft({
        scope: 'both',
        totalUsd6: '10000000',
        baseFundingToken: BASE_DEPOSIT_TOKENS[0],
        baseUsdPrice: 1,
        arbitrumFundingToken: DEFAULT_ARBITRUM_FUNDING_TOKEN,
        arbitrumUsdPrice: 1,
      }),
    ).toBeNull();
  });

  it('preserves the selected Arbitrum token in frozen single-chain drafts', () => {
    expect(
      buildSingleChainFundingDraft({
        scope: 'arbitrum',
        totalUsd6: '10000000',
        baseFundingToken: BASE_DEPOSIT_TOKENS[0],
        baseUsdPrice: 1,
        arbitrumFundingToken: ARBITRUM_DEPOSIT_TOKENS[1],
        arbitrumUsdPrice: 1,
      }),
    ).toEqual({
      scope: 'arbitrum',
      chainId: 42161,
      fromToken: ARBITRUM_DEPOSIT_TOKENS[1].depositAddress,
      fromAmount: '10000000',
      marketKey: 'btc-usdc',
    });

    expect(
      buildSingleChainFundingDraft({
        scope: 'arbitrum',
        totalUsd6: '10000000',
        baseFundingToken: BASE_DEPOSIT_TOKENS[0],
        baseUsdPrice: 1,
        arbitrumFundingToken: ARBITRUM_DEPOSIT_TOKENS[2],
        arbitrumUsdPrice: 2_000,
      }),
    ).toEqual({
      scope: 'arbitrum',
      chainId: 42161,
      fromToken: ARBITRUM_DEPOSIT_TOKENS[2].depositAddress,
      fromAmount: '5000000000000000',
      marketKey: 'btc-usdc',
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  amountInputToUsd6,
  amountUsdFromInput,
  buildSingleChainFundingDraft,
  buildStrategyFundingOptions,
  chainMaxUsd,
  depositSupportLabel,
  fundingTokenAmountFromUsd,
  maxUsdAmountInput,
  minimumDepositUsd6ForScope,
  MIN_STRATEGY_DEPOSIT_USD6,
  normalizeAmountInput,
  requiredChainUnavailableForScope,
  singleChainFromAmount,
  strategyMaxTotalUsd,
} from '@/integration/investAmountModel';
import {
  ARBITRUM_DEPOSIT_TOKENS,
  BASE_DEPOSIT_TOKENS,
  DEFAULT_ARBITRUM_FUNDING_TOKEN,
} from '@/integration/depositTokens';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';

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
  it('generates deposit support copy from supported Base tokens', () => {
    expect(depositSupportLabel([{ symbol: 'USDC' }, { symbol: 'ETH' }])).toBe(
      'Deposit v1 supports Base USDC and Base ETH',
    );
  });

  it('keeps USD mode as USD and converts token mode through selected price', () => {
    expect(amountUsdFromInput('1,000', 'USD', null)).toBe(1000);
    expect(amountUsdFromInput('2.5', 'Token', 3000)).toBe(7500);
    expect(amountUsdFromInput('2.5', 'Token', null)).toBeNull();
    expect(amountUsdFromInput('0', 'USD', 1)).toBeNull();
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

  it('converts USD input to exact 6-decimal base units', () => {
    expect(amountInputToUsd6('1,234.5678919')).toBe('1234567891');
    expect(amountInputToUsd6('0.000001')).toBe('1');
  });

  it('uses the Base Morpho floor only for Base-only deposits', () => {
    expect(
      BigInt(amountInputToUsd6('0.009999')) >=
        minimumDepositUsd6ForScope('base'),
    ).toBe(false);
    expect(
      BigInt(amountInputToUsd6('0.01')) >= minimumDepositUsd6ForScope('base'),
    ).toBe(true);
    expect(
      BigInt(amountInputToUsd6('9.999999')) >=
        minimumDepositUsd6ForScope('both'),
    ).toBe(false);
    expect(
      BigInt(amountInputToUsd6('9.999999')) >=
        minimumDepositUsd6ForScope('arbitrum'),
    ).toBe(false);
    expect(minimumDepositUsd6ForScope('both')).toBe(MIN_STRATEGY_DEPOSIT_USD6);
    expect(minimumDepositUsd6ForScope('arbitrum')).toBe(
      MIN_STRATEGY_DEPOSIT_USD6,
    );
    expect(
      BigInt(amountInputToUsd6('10')) >= minimumDepositUsd6ForScope('both'),
    ).toBe(true);
    expect(
      BigInt(amountInputToUsd6('10')) >= minimumDepositUsd6ForScope('arbitrum'),
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
    expect(chainMaxUsd(BASE_DEPOSIT_TOKENS[0], baseUsdc)).toBe(40);
    expect(chainMaxUsd(BASE_DEPOSIT_TOKENS[1], baseEth)).toBe(1_994);
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
      }),
    ).toBeNull();
  });
});

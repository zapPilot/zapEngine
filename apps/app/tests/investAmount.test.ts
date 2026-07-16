import { describe, expect, it } from 'vitest';

import {
  amountInputToUsd6,
  amountUsdFromInput,
  buildStrategyFundingOptions,
  depositSupportLabel,
  fundingTokenAmountFromUsd,
  maxUsdAmountInput,
  normalizeAmountInput,
  strategyMaxTotalUsd,
} from '@/integration/investAmountModel';
import {
  ARBITRUM_DEPOSIT_TOKENS,
  BASE_DEPOSIT_TOKENS,
} from '@/integration/depositTokens';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';

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

  it('shows allocation token amounts with a stablecoin display fallback', () => {
    expect(
      fundingTokenAmountFromUsd(100, 4_000, BASE_DEPOSIT_TOKENS[0], null),
    ).toBe(40);
    expect(
      fundingTokenAmountFromUsd(100, 4_000, BASE_DEPOSIT_TOKENS[1], null),
    ).toBeNull();
  });

  it('sorts positive token balances first and caps Max by both chains', () => {
    const row = (
      chainId: 8453 | 42161,
      symbol: 'USDC' | 'USDT' | 'ETH',
      usdValue: number | null,
      balanceBaseUnits: string,
      usdPrice: number | null,
    ): ChainTokenBalanceRow => ({
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
    });
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
});

import {
  baseUnitsToUsdcInput,
  bridgeBalanceQueryKey,
  bridgeDestinationChains,
  BRIDGE_CHAIN_OPTIONS,
  BRIDGE_SOURCE_CHAINS,
  normalizeUsdcInput,
  usdcInputToBaseUnits,
} from '@/integration/bridgeTestModel';
import { describe, expect, it } from 'vitest';

const HYPERCORE_CHAIN_ID = 1337;

describe('bridgeTestModel', () => {
  it('allows only EVM chains as sources and Hyperliquid as destination-only', () => {
    expect(BRIDGE_SOURCE_CHAINS.map((chain) => chain.chainId)).toEqual([
      1, 42161, 8453,
    ]);
    expect(
      BRIDGE_CHAIN_OPTIONS.find(
        (chain) => chain.chainId === HYPERCORE_CHAIN_ID,
      ),
    ).toMatchObject({ canSource: false, canDestination: true });
  });

  it('excludes the selected source from destinations', () => {
    expect(bridgeDestinationChains(8453).map((chain) => chain.chainId)).toEqual(
      [1, 42161, HYPERCORE_CHAIN_ID],
    );
  });

  it('parses USDC input with exactly six decimal places', () => {
    expect(normalizeUsdcInput('1,234.5678909')).toBe('1234.567890');
    expect(usdcInputToBaseUnits('10.25')).toBe('10250000');
    expect(usdcInputToBaseUnits('0.000001')).toBe('1');
    expect(usdcInputToBaseUnits('invalid')).toBe('0');
    expect(baseUnitsToUsdcInput('10250000')).toBe('10.25');
  });

  it('scopes live balance queries by wallet, chain, token, and purpose', () => {
    const baseKey = bridgeBalanceQueryKey({
      address: '0xABC',
      chainId: 8453,
      tokenAddress: '0xUSDC',
      kind: 'token',
    });
    const arbitrumKey = bridgeBalanceQueryKey({
      address: '0xABC',
      chainId: 42161,
      tokenAddress: '0xUSDC',
      kind: 'token',
    });
    const gasKey = bridgeBalanceQueryKey({
      address: '0xABC',
      chainId: 8453,
      tokenAddress: '0x0000000000000000000000000000000000000000',
      kind: 'gas',
    });

    expect(baseKey).not.toEqual(arbitrumKey);
    expect(baseKey).not.toEqual(gasKey);
    expect(baseKey).toEqual([
      'bridge-test',
      'balance',
      'token',
      '0xABC',
      8453,
      '0xusdc',
    ]);
  });
});

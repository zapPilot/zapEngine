import { describe, expect, it } from 'vitest';

import {
  DEPOSIT_USDC_ADDRESSES,
  HYPERCORE_CHAIN_ID,
  NATIVE_TOKEN_ADDRESS,
  RoutedInvestDepositRequestSchema,
  SUPPORTED_DEPOSIT_CHAINS,
} from '../../../src/api/index.js';

const USER = '0x1111111111111111111111111111111111111111';

function request(params: {
  sourceChainId: number;
  fromToken: string;
  destinationChainId: number;
}) {
  return {
    kind: 'invest' as const,
    userAddress: USER,
    fromToken: params.fromToken,
    fromAmount: '10000000',
    sourceChainId: params.sourceChainId,
    split: { [String(params.destinationChainId)]: 1 },
  };
}

describe('RoutedInvestDepositRequestSchema', () => {
  it('allows Ethereum USDC to route into Arbitrum first', () => {
    expect(
      RoutedInvestDepositRequestSchema.safeParse(
        request({
          sourceChainId: SUPPORTED_DEPOSIT_CHAINS.ETHEREUM,
          fromToken:
            DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ETHEREUM]!,
          destinationChainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
        }),
      ).success,
    ).toBe(true);
  });

  it('allows Base native ETH to route into Arbitrum first', () => {
    expect(
      RoutedInvestDepositRequestSchema.safeParse(
        request({
          sourceChainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
          fromToken: NATIVE_TOKEN_ADDRESS,
          destinationChainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
        }),
      ).success,
    ).toBe(true);
  });

  it('allows native Arbitrum USDC into Hyperliquid Bridge2', () => {
    expect(
      RoutedInvestDepositRequestSchema.safeParse(
        request({
          sourceChainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
          fromToken:
            DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ARBITRUM]!,
          destinationChainId: HYPERCORE_CHAIN_ID,
        }),
      ).success,
    ).toBe(true);
  });

  it('rejects Base direct to HyperCore', () => {
    const parsed = RoutedInvestDepositRequestSchema.safeParse(
      request({
        sourceChainId: SUPPORTED_DEPOSIT_CHAINS.BASE,
        fromToken: DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.BASE]!,
        destinationChainId: HYPERCORE_CHAIN_ID,
      }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toContain(
        'Hyperliquid deposits must first route to native USDC on Arbitrum',
      );
    }
  });

  it('rejects Ethereum direct to HyperCore', () => {
    const parsed = RoutedInvestDepositRequestSchema.safeParse(
      request({
        sourceChainId: SUPPORTED_DEPOSIT_CHAINS.ETHEREUM,
        fromToken:
          DEPOSIT_USDC_ADDRESSES[SUPPORTED_DEPOSIT_CHAINS.ETHEREUM]!,
        destinationChainId: HYPERCORE_CHAIN_ID,
      }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toContain(
        'Hyperliquid deposits must first route to native USDC on Arbitrum',
      );
    }
  });

  it('rejects native ETH into Bridge2 even on Arbitrum', () => {
    const parsed = RoutedInvestDepositRequestSchema.safeParse(
      request({
        sourceChainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
        fromToken: NATIVE_TOKEN_ADDRESS,
        destinationChainId: HYPERCORE_CHAIN_ID,
      }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toContain(
        'Hyperliquid Bridge2 accepts native Arbitrum USDC only',
      );
    }
  });
});

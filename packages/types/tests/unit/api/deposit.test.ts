import { describe, expect, it } from 'vitest';

import {
  AddressSchema,
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  DepositLegSchema,
  DepositPlanSchema,
  DepositRequestSchema,
  HexDataSchema,
  NATIVE_TOKEN_ADDRESS,
  PlanOrchestrationDepositRequestSchema,
  PreparedTransactionSchema,
  SUPPORTED_DEPOSIT_CHAINS,
} from '../../../src/api/deposit.js';

const USER = '0x' + 'a'.repeat(40);
const VAULT = '0x' + 'b'.repeat(40);

describe('AddressSchema', () => {
  it('accepts canonical EVM addresses', () => {
    expect(AddressSchema.safeParse(USER).success).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(AddressSchema.safeParse('0x123').success).toBe(false);
    expect(AddressSchema.safeParse('not-an-address').success).toBe(false);
  });
});

describe('HexDataSchema', () => {
  it('accepts even-length 0x-prefixed hex', () => {
    expect(HexDataSchema.safeParse('0x').success).toBe(true);
    expect(HexDataSchema.safeParse('0xdeadbeef').success).toBe(true);
  });

  it('rejects odd-length hex (must be byte-aligned)', () => {
    expect(HexDataSchema.safeParse('0xabc').success).toBe(false);
  });

  it('rejects missing 0x prefix', () => {
    expect(HexDataSchema.safeParse('deadbeef').success).toBe(false);
  });
});

describe('PreparedTransactionSchema', () => {
  const valid = {
    to: VAULT,
    data: '0xdeadbeef',
    value: '0',
    chainId: 8453,
    meta: { intentType: 'SUPPLY' },
  };

  it('accepts a minimal valid prepared tx', () => {
    expect(PreparedTransactionSchema.safeParse(valid).success).toBe(true);
  });

  it('passes through unknown meta keys', () => {
    const result = PreparedTransactionSchema.safeParse({
      ...valid,
      meta: { intentType: 'SUPPLY', someExtraKey: 'allowed' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects chainId 0 (must be positive)', () => {
    expect(
      PreparedTransactionSchema.safeParse({ ...valid, chainId: 0 }).success,
    ).toBe(false);
  });

  it('rejects non-integer chainId', () => {
    expect(
      PreparedTransactionSchema.safeParse({ ...valid, chainId: 8453.5 })
        .success,
    ).toBe(false);
  });

  it('rejects when value is not a decimal string', () => {
    expect(
      PreparedTransactionSchema.safeParse({ ...valid, value: '0x10' })
        .success,
    ).toBe(false);
  });

  it('requires meta.intentType', () => {
    expect(
      PreparedTransactionSchema.safeParse({
        ...valid,
        meta: { estimatedDuration: 5 },
      }).success,
    ).toBe(false);
  });
});

describe('DepositLegSchema', () => {
  it('accepts a supply leg', () => {
    const result = DepositLegSchema.safeParse({
      chainId: 8453,
      kind: 'supply',
      toToken: VAULT,
      fromAmount: '1000000',
      toAmountMin: '990000',
      gasUsd: '0.42',
      durationSec: 12,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unsupported leg kind', () => {
    expect(
      DepositLegSchema.safeParse({
        chainId: 8453,
        kind: 'rebalance',
        toToken: VAULT,
        fromAmount: '1000000',
        toAmountMin: '990000',
        gasUsd: '0.42',
        durationSec: 12,
      }).success,
    ).toBe(false);
  });

  it('rejects negative durationSec', () => {
    expect(
      DepositLegSchema.safeParse({
        chainId: 8453,
        kind: 'supply',
        toToken: VAULT,
        fromAmount: '1000000',
        toAmountMin: '990000',
        gasUsd: '0.42',
        durationSec: -1,
      }).success,
    ).toBe(false);
  });
});

describe('DepositPlanSchema', () => {
  it('accepts a plan with empty legs and calls', () => {
    expect(
      DepositPlanSchema.safeParse({
        legs: [],
        approvals: [],
        calls: [],
        totalGasUsd: '0',
        sourceChainId: 8453,
      }).success,
    ).toBe(true);
  });

  it('rejects a plan missing the sourceChainId', () => {
    expect(
      DepositPlanSchema.safeParse({
        legs: [],
        approvals: [],
        calls: [],
        totalGasUsd: '0',
      } as unknown).success,
    ).toBe(false);
  });
});

describe('DepositRequestSchema (Base-only v1)', () => {
  it('accepts USDC on Base', () => {
    expect(
      DepositRequestSchema.safeParse({
        userAddress: USER,
        fromToken: BASE_USDC_ADDRESS,
        fromAmount: '1000000',
        sourceChainId: BASE_CHAIN_ID,
      }).success,
    ).toBe(true);
  });

  it('accepts native ETH on Base', () => {
    expect(
      DepositRequestSchema.safeParse({
        userAddress: USER,
        fromToken: NATIVE_TOKEN_ADDRESS,
        fromAmount: '1000000000000000000',
        sourceChainId: BASE_CHAIN_ID,
      }).success,
    ).toBe(true);
  });

  it('rejects Ethereum mainnet (only Base supported)', () => {
    const result = DepositRequestSchema.safeParse({
      userAddress: USER,
      fromToken: BASE_USDC_ADDRESS,
      fromAmount: '1000000',
      sourceChainId: SUPPORTED_DEPOSIT_CHAINS.ETHEREUM,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const chainIssue = result.error.issues.find((i) =>
        i.path.includes('sourceChainId'),
      );
      expect(chainIssue?.message).toBe('Deposit v1 supports Base only');
    }
  });

  it('rejects an unsupported token on Base', () => {
    const result = DepositRequestSchema.safeParse({
      userAddress: USER,
      fromToken: VAULT, // not USDC, not native
      fromAmount: '1000000',
      sourceChainId: BASE_CHAIN_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const tokenIssue = result.error.issues.find((i) =>
        i.path.includes('fromToken'),
      );
      expect(tokenIssue?.message).toMatch(/USDC and native ETH on Base/);
    }
  });
});

describe('PlanOrchestrationDepositRequestSchema (discriminated union)', () => {
  it('accepts a v1 invest request with Base USDC', () => {
    expect(
      PlanOrchestrationDepositRequestSchema.safeParse({
        kind: 'invest',
        userAddress: USER,
        fromToken: BASE_USDC_ADDRESS,
        fromAmount: '1000000',
        sourceChainId: BASE_CHAIN_ID,
      }).success,
    ).toBe(true);
  });

  it('accepts a gmx-v2 request without applying Base-only check', () => {
    // gmx-v2 path skips the addBaseDepositValidationIssues branch
    expect(
      PlanOrchestrationDepositRequestSchema.safeParse({
        kind: 'gmx-v2',
        marketKey: 'btc-usdc',
        amount: '1000000',
        userAddress: USER,
      }).success,
    ).toBe(true);
  });

  it('rejects gmx-v2 with an unknown marketKey', () => {
    expect(
      PlanOrchestrationDepositRequestSchema.safeParse({
        kind: 'gmx-v2',
        marketKey: 'doge-usdc',
        amount: '1000000',
        userAddress: USER,
      }).success,
    ).toBe(false);
  });

  it('applies Base-only validation to the invest branch only', () => {
    expect(
      PlanOrchestrationDepositRequestSchema.safeParse({
        kind: 'invest',
        userAddress: USER,
        fromToken: BASE_USDC_ADDRESS,
        fromAmount: '1000000',
        sourceChainId: SUPPORTED_DEPOSIT_CHAINS.ETHEREUM,
      }).success,
    ).toBe(false);
  });
});

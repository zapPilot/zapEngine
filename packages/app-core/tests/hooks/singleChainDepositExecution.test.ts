import {
  assertNativeGmxSpendWithinRequestedAmount,
  assertPlannedAccount,
  assertSingleChainPlan,
  assertSingleChainPreflight,
  assertSupportedSingleChainRequest,
  copySingleChainDepositRequest,
  readSingleChainPositionBalance,
  waitForSingleChainPositionIncrease,
} from '@core/hooks/singleChainDepositExecution';
import { type DepositPlan, NATIVE_TOKEN_ADDRESS } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBalance: vi.fn(),
  readContract: vi.fn(),
  pollUntil: vi.fn(),
}));

vi.mock('@core/services/intentClient', () => ({
  getPublicClient: () => ({
    getBalance: mocks.getBalance,
    readContract: mocks.readContract,
  }),
}));

vi.mock('@core/lib/polling', () => ({
  pollUntil: (...args: unknown[]) => mocks.pollUntil(...args),
}));

const USER = '0x1111111111111111111111111111111111111111';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const TARGET = '0x2222222222222222222222222222222222222222';

function planWithValue(value: string): DepositPlan {
  return {
    legs: [],
    approvals: [],
    calls: [
      {
        to: TARGET,
        data: '0x1234',
        value,
        chainId: 42161,
        meta: { intentType: 'SUPPLY' },
      },
    ],
    totalGasUsd: '0',
    sourceChainId: 42161,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getBalance.mockResolvedValue(10n ** 20n);
  mocks.readContract.mockResolvedValue(10n ** 20n);
  mocks.pollUntil.mockResolvedValue(undefined);
});

describe('singleChainDepositExecution', () => {
  const investRequest = {
    kind: 'invest',
    sourceChainId: 8453,
    fromToken: USDC,
    fromAmount: '1000000',
    userAddress: USER,
    split: { reserveUsd6: '100', investUsd6: '999900' },
  } as never;
  const gmxRequest = {
    kind: 'gmx-v2',
    marketKey: 'btc-usdc',
    fromToken: USDC,
    amount: '1000000',
    userAddress: USER,
  } as never;
  const basketRequest = {
    kind: 'gmx-v2-basket',
    fromToken: USDC,
    amount: '1000000',
    userAddress: USER,
  } as never;

  it('copies requests without sharing nested invest split state', () => {
    const copy = copySingleChainDepositRequest(investRequest);
    expect(copy).toEqual(investRequest);
    expect((copy as any).split).not.toBe((investRequest as any).split);
    expect(copySingleChainDepositRequest(gmxRequest)).toEqual(gmxRequest);

    const noSplit = { ...(investRequest as any), split: undefined };
    expect(copySingleChainDepositRequest(noSplit)).toEqual(noSplit);
  });

  it('accepts Base invest requests and rejects non-Base invest requests', () => {
    expect(() =>
      assertSupportedSingleChainRequest(investRequest),
    ).not.toThrow();
    expect(() => assertSupportedSingleChainRequest(gmxRequest)).not.toThrow();
    expect(() =>
      assertSupportedSingleChainRequest({
        ...(investRequest as any),
        sourceChainId: 1,
      }),
    ).toThrow('Single-chain Morpho deposits must use Base');
  });

  it('validates plan chain and every transaction chain', () => {
    const plan = { ...planWithValue('0'), sourceChainId: 42161 };
    expect(() => assertSingleChainPlan(plan, gmxRequest)).not.toThrow();
    expect(() =>
      assertSingleChainPlan({ ...plan, sourceChainId: 8453 }, gmxRequest),
    ).toThrow('does not match 42161');
    expect(() =>
      assertSingleChainPlan(
        {
          ...plan,
          calls: [{ ...plan.calls[0]!, chainId: 8453 }],
        },
        gmxRequest,
      ),
    ).toThrow('cross-chain action');
  });

  it('validates the planned account', () => {
    expect(() => assertPlannedAccount(USER, USER, 'deposit')).not.toThrow();
    expect(() => assertPlannedAccount(undefined, USER, 'deposit')).toThrow(
      'Reconnect the wallet',
    );
    expect(() =>
      assertPlannedAccount(
        '0x3333333333333333333333333333333333333333',
        USER,
        'deposit',
      ),
    ).toThrow('connected wallet changed');
  });

  describe('assertNativeGmxSpendWithinRequestedAmount', () => {
    it('blocks the 0.001 ETH input -> 0.005 ETH planned-spend regression', () => {
      expect(() =>
        assertNativeGmxSpendWithinRequestedAmount({
          request: {
            kind: 'gmx-v2-basket',
            fromToken: NATIVE_TOKEN_ADDRESS,
            amount: '1000000000000000',
            userAddress: USER,
          },
          plan: planWithValue('5000000000000000'),
        }),
      ).toThrow('exceeding the requested 0.001 ETH budget');
    });

    it('allows a native GMX plan whose wallet value stays within the entered budget', () => {
      expect(() =>
        assertNativeGmxSpendWithinRequestedAmount({
          request: {
            kind: 'gmx-v2-basket',
            fromToken: NATIVE_TOKEN_ADDRESS,
            amount: '10000000000000000',
            userAddress: USER,
          },
          plan: planWithValue('10000000000000000'),
        }),
      ).not.toThrow();
    });

    it('does not apply the native ETH budget invariant to ERC-20 or invest funding', () => {
      expect(() =>
        assertNativeGmxSpendWithinRequestedAmount({
          request: basketRequest,
          plan: planWithValue('4000000000000000'),
        }),
      ).not.toThrow();
      expect(() =>
        assertNativeGmxSpendWithinRequestedAmount({
          request: investRequest,
          plan: { ...planWithValue('0'), sourceChainId: 8453 },
        }),
      ).not.toThrow();
    });
  });

  it('preflights native funding using the larger requested/planned value plus gas', async () => {
    const native = {
      ...(gmxRequest as any),
      fromToken: NATIVE_TOKEN_ADDRESS,
      amount: '10000000000000000',
    };
    mocks.getBalance.mockResolvedValueOnce(10n ** 18n);
    await expect(
      assertSingleChainPreflight({
        request: native,
        plan: planWithValue('5000000000000000'),
        address: USER,
      }),
    ).resolves.toBeUndefined();

    mocks.getBalance.mockResolvedValueOnce(1n);
    await expect(
      assertSingleChainPreflight({
        request: native,
        plan: planWithValue('5000000000000000'),
        address: USER,
      }),
    ).rejects.toThrow('Native balance too low');
  });

  it('preflights ERC-20 funding and native gas separately', async () => {
    const plan = planWithValue('1000');
    mocks.readContract.mockResolvedValueOnce(2_000_000n);
    mocks.getBalance.mockResolvedValueOnce(10n ** 18n);
    await expect(
      assertSingleChainPreflight({ request: gmxRequest, plan, address: USER }),
    ).resolves.toBeUndefined();

    mocks.readContract.mockResolvedValueOnce(1n);
    mocks.getBalance.mockResolvedValueOnce(10n ** 18n);
    await expect(
      assertSingleChainPreflight({ request: gmxRequest, plan, address: USER }),
    ).rejects.toThrow('Funding balance too low');

    mocks.readContract.mockResolvedValueOnce(2_000_000n);
    mocks.getBalance.mockResolvedValueOnce(1n);
    await expect(
      assertSingleChainPreflight({ request: gmxRequest, plan, address: USER }),
    ).rejects.toThrow('ETH balance too low');
  });

  it('reads and packs invest, single-market, and basket position balances', async () => {
    mocks.readContract.mockResolvedValue(7n);
    await expect(
      readSingleChainPositionBalance(investRequest, USER),
    ).resolves.toBe(7n);
    await expect(
      readSingleChainPositionBalance(gmxRequest, USER),
    ).resolves.toBe(7n);

    mocks.readContract
      .mockReset()
      .mockResolvedValueOnce(1n)
      .mockResolvedValueOnce(2n);
    const packed = await readSingleChainPositionBalance(basketRequest, USER);
    expect(mocks.readContract).toHaveBeenCalledTimes(2);
    expect(packed).toBe(1n + (2n << 256n));
  });

  it('configures settlement polling and stops only after every position increases', async () => {
    await waitForSingleChainPositionIncrease({
      request: basketRequest,
      address: USER,
      baseline: 1n + (2n << 256n),
    });
    const basketConfig = mocks.pollUntil.mock.calls.at(-1)?.[0];
    expect(basketConfig.intervalMs).toBe(4_000);
    expect(basketConfig.timeoutMs).toBe(5 * 60_000);
    expect(basketConfig.shouldStop(2n + (3n << 256n))).toBe(true);
    expect(basketConfig.shouldStop(2n + (2n << 256n))).toBe(false);
    await basketConfig.fn();

    await waitForSingleChainPositionIncrease({
      request: investRequest,
      address: USER,
      baseline: 1n,
    });
    expect(mocks.pollUntil.mock.calls.at(-1)?.[0].timeoutMs).toBe(90_000);
  });
});

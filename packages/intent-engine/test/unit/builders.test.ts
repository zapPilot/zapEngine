import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, type Address, type PublicClient } from 'viem';

import { buildSwapTx } from '../../src/builders/swap.builder.js';
import { buildSupplyTx } from '../../src/builders/supply.builder.js';
import { buildWithdrawTx } from '../../src/builders/withdraw.builder.js';
import { buildRotateTx } from '../../src/builders/rotate.builder.js';
import type { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { MORPHO_VAULT_ABI } from '../../src/protocols/morpho/morpho.constants.js';
import type { TransactionQuote } from '../../src/types/transaction.types.js';

const FROM_ADDRESS = '0x1234567890123456789012345678901234567890' as Address;

// Base chain: USDC, MOONWELL_USDC
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const BASE_MOONWELL_USDC =
  '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A' as Address;
const BASE_SEAMLESS_WETH =
  '0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1' as Address;
const BASE_WETH = '0x4200000000000000000000000000000000000006' as Address;

// Eth chain (Base vault used against chainId=1 should fail validation)
const ETH_WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address;
const ETH_WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as Address;

const DEPOSIT_SELECTOR = '0x6e553f65';
const REDEEM_SELECTOR = '0xba087652';

function makeStubQuote(
  overrides: Partial<TransactionQuote> = {},
): TransactionQuote {
  return {
    transaction: {
      to: BASE_MOONWELL_USDC,
      data: '0xdeadbeef',
      value: '0',
      chainId: 8453,
      gasLimit: '250000',
      meta: { intentType: 'SUPPLY' },
    },
    estimate: {
      fromAmount: '1000000',
      toAmount: '999500',
      toAmountMin: '994500',
      gasCostUsd: '0.42',
      executionDuration: 18,
    },
    approval: {
      tokenAddress: BASE_USDC,
      spenderAddress: '0x0000000000000000000000000000000000000aaa' as Address,
      amount: '1000000',
    },
    ...overrides,
  };
}

function makeAdapterMock(): {
  adapter: LiFiAdapter;
  getSwapQuote: ReturnType<typeof vi.fn>;
  getContractCallQuote: ReturnType<typeof vi.fn>;
} {
  const getSwapQuote = vi.fn();
  const getContractCallQuote = vi.fn();
  return {
    adapter: { getSwapQuote, getContractCallQuote } as unknown as LiFiAdapter,
    getSwapQuote,
    getContractCallQuote,
  };
}

describe('buildSwapTx', () => {
  it('forwards intent fields to the adapter and defaults slippageBps to 50', async () => {
    const { adapter, getSwapQuote } = makeAdapterMock();
    getSwapQuote.mockResolvedValueOnce(makeStubQuote());

    await buildSwapTx(
      {
        type: 'SWAP',
        fromAddress: FROM_ADDRESS,
        chainId: 1,
        fromToken: ETH_WETH,
        toToken: ETH_WBTC,
        fromAmount: '1000000000000000000',
      },
      adapter,
    );

    expect(getSwapQuote).toHaveBeenCalledWith({
      fromChain: 1,
      toChain: 1,
      fromToken: ETH_WETH,
      toToken: ETH_WBTC,
      fromAmount: '1000000000000000000',
      fromAddress: FROM_ADDRESS,
      slippageBps: 50,
    });
  });

  it('passes a caller-provided slippageBps through', async () => {
    const { adapter, getSwapQuote } = makeAdapterMock();
    getSwapQuote.mockResolvedValueOnce(makeStubQuote());

    await buildSwapTx(
      {
        type: 'SWAP',
        fromAddress: FROM_ADDRESS,
        chainId: 1,
        fromToken: ETH_WETH,
        toToken: ETH_WBTC,
        fromAmount: '1',
        slippageBps: 100,
      },
      adapter,
    );

    expect(getSwapQuote.mock.calls[0]?.[0]).toMatchObject({ slippageBps: 100 });
  });

  it('throws ValidationError before adapter is called when chain is unsupported', async () => {
    const { adapter, getSwapQuote } = makeAdapterMock();

    await expect(
      buildSwapTx(
        {
          type: 'SWAP',
          fromAddress: FROM_ADDRESS,
          chainId: 137,
          fromToken: ETH_WETH,
          toToken: ETH_WBTC,
          fromAmount: '1',
        },
        adapter,
      ),
    ).rejects.toThrow(/Invalid swap intent/i);
    expect(getSwapQuote).not.toHaveBeenCalled();
  });
});

describe('buildSupplyTx', () => {
  it('reads vault.asset() and encodes a Morpho deposit call for the LI.FI quote', async () => {
    const { adapter, getContractCallQuote } = makeAdapterMock();
    getContractCallQuote.mockResolvedValueOnce(makeStubQuote());

    const readContract = vi.fn().mockResolvedValueOnce(BASE_USDC); // vault.asset()
    const publicClient = { readContract } as unknown as PublicClient;

    await buildSupplyTx(
      {
        type: 'SUPPLY',
        fromAddress: FROM_ADDRESS,
        chainId: 8453,
        fromToken: BASE_USDC,
        fromAmount: '5000000',
        vaultAddress: BASE_MOONWELL_USDC,
        protocol: 'morpho',
      },
      adapter,
      publicClient,
    );

    expect(readContract).toHaveBeenCalledWith({
      address: BASE_MOONWELL_USDC,
      abi: MORPHO_VAULT_ABI,
      functionName: 'asset',
    });

    const args = getContractCallQuote.mock.calls[0]?.[0];
    expect(args.fromChain).toBe(8453);
    expect(args.toChain).toBe(8453);
    expect(args.fromToken).toBe(BASE_USDC);
    expect(args.toToken).toBe(BASE_USDC);
    expect(args.toAmount).toBe('5000000');

    const [call] = args.contractCalls;
    expect(call.toContractAddress).toBe(BASE_MOONWELL_USDC);
    expect(call.toContractCallData.slice(0, 10)).toBe(DEPOSIT_SELECTOR);

    // Decode the calldata to confirm args land in the right positions.
    const decoded = decodeFunctionData({
      abi: MORPHO_VAULT_ABI,
      data: call.toContractCallData,
    });
    expect(decoded.functionName).toBe('deposit');
    expect(decoded.args).toEqual([5_000_000n, FROM_ADDRESS]);
  });
});

describe('buildWithdrawTx', () => {
  it('encodes a redeem(shares, fromAddress, fromAddress) call against the vault', () => {
    const tx = buildWithdrawTx({
      type: 'WITHDRAW',
      fromAddress: FROM_ADDRESS,
      chainId: 8453,
      vaultAddress: BASE_MOONWELL_USDC,
      shareAmount: '1000000000000000000',
      protocol: 'morpho',
    });

    expect(tx.to).toBe(BASE_MOONWELL_USDC);
    expect(tx.value).toBe('0');
    expect(tx.chainId).toBe(8453);
    expect(tx.meta.intentType).toBe('WITHDRAW');
    expect(tx.data.slice(0, 10)).toBe(REDEEM_SELECTOR);

    const decoded = decodeFunctionData({
      abi: MORPHO_VAULT_ABI,
      data: tx.data as `0x${string}`,
    });
    expect(decoded.functionName).toBe('redeem');
    // receiver and owner both default to fromAddress for a simple withdrawal
    expect(decoded.args).toEqual([
      1_000_000_000_000_000_000n,
      FROM_ADDRESS,
      FROM_ADDRESS,
    ]);
  });
});

describe('buildRotateTx', () => {
  let readContract: ReturnType<typeof vi.fn>;
  let publicClient: PublicClient;

  beforeEach(() => {
    readContract = vi.fn();
    publicClient = { readContract } as unknown as PublicClient;
  });

  it('previews redeem, resolves both vault assets, and builds a 2-step plan', async () => {
    // previewRedeem → 994_000 assets out
    readContract.mockResolvedValueOnce(994_000n);
    // fromVault.asset() → USDC
    readContract.mockResolvedValueOnce(BASE_USDC);
    // toVault.asset()   → WETH (cross-asset rotation)
    readContract.mockResolvedValueOnce(BASE_WETH);

    const { adapter, getContractCallQuote } = makeAdapterMock();
    getContractCallQuote.mockResolvedValueOnce(
      makeStubQuote({
        transaction: {
          to: '0x000000000000000000000000000000000000F00D' as Address,
          data: '0xabcd',
          value: '0',
          chainId: 8453,
          gasLimit: '400000',
          meta: { intentType: 'SUPPLY' },
        },
        estimate: {
          fromAmount: '994000',
          toAmount: '500000000000000000', // 0.5 WETH
          toAmountMin: '495000000000000000',
          gasCostUsd: '1.25',
          executionDuration: 30,
        },
      }),
    );

    const plan = await buildRotateTx(
      {
        type: 'ROTATE',
        fromAddress: FROM_ADDRESS,
        chainId: 8453,
        fromVault: BASE_MOONWELL_USDC,
        toVault: BASE_SEAMLESS_WETH,
        shareAmount: '1000000',
        protocol: 'morpho',
      },
      adapter,
      publicClient,
    );

    // Three parallel reads issued against the correct vaults
    expect(readContract).toHaveBeenCalledTimes(3);
    expect(readContract).toHaveBeenNthCalledWith(1, {
      address: BASE_MOONWELL_USDC,
      abi: MORPHO_VAULT_ABI,
      functionName: 'previewRedeem',
      args: [1_000_000n],
    });
    expect(readContract).toHaveBeenNthCalledWith(2, {
      address: BASE_MOONWELL_USDC,
      abi: MORPHO_VAULT_ABI,
      functionName: 'asset',
    });
    expect(readContract).toHaveBeenNthCalledWith(3, {
      address: BASE_SEAMLESS_WETH,
      abi: MORPHO_VAULT_ABI,
      functionName: 'asset',
    });

    // LI.FI step uses the previewed amount, not the intent's shareAmount
    const quoteArgs = getContractCallQuote.mock.calls[0]?.[0];
    expect(quoteArgs.fromToken).toBe(BASE_USDC);
    expect(quoteArgs.toToken).toBe(BASE_WETH);
    expect(quoteArgs.toAmount).toBe('994000');
    expect(quoteArgs.contractCalls[0].fromAmount).toBe('994000');
    expect(quoteArgs.contractCalls[0].toContractAddress).toBe(
      BASE_SEAMLESS_WETH,
    );
    expect(quoteArgs.contractCalls[0].toContractCallData.slice(0, 10)).toBe(
      DEPOSIT_SELECTOR,
    );

    // Plan shape
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]?.to).toBe(BASE_MOONWELL_USDC);
    expect(plan.steps[0]?.data.slice(0, 10)).toBe(REDEEM_SELECTOR);
    expect(plan.steps[0]?.meta.intentType).toBe('ROTATE_WITHDRAW');
    expect(plan.steps[1]?.meta.intentType).toBe('SUPPLY');
    expect(plan.estimates.expectedOutput).toBe('500000000000000000');
    expect(plan.estimates.totalDuration).toBe(30);
    expect(plan.approval?.tokenAddress).toBe(BASE_USDC);
  });

  it('surfaces LI.FI adapter errors rather than silently succeeding', async () => {
    readContract.mockResolvedValueOnce(1n);
    readContract.mockResolvedValueOnce(BASE_USDC);
    readContract.mockResolvedValueOnce(BASE_WETH);

    const { adapter, getContractCallQuote } = makeAdapterMock();
    getContractCallQuote.mockRejectedValueOnce(new Error('LI.FI down'));

    await expect(
      buildRotateTx(
        {
          type: 'ROTATE',
          fromAddress: FROM_ADDRESS,
          chainId: 8453,
          fromVault: BASE_MOONWELL_USDC,
          toVault: BASE_SEAMLESS_WETH,
          shareAmount: '1',
          protocol: 'morpho',
        },
        adapter,
        publicClient,
      ),
    ).rejects.toThrow(/LI\.FI down/);
  });
});

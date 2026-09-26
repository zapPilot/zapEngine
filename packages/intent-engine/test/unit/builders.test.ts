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

// Base chain: USDC, SPARK_USDC
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const BASE_SPARK_USDC = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A' as Address;
const BASE_MOONWELL_WETH =
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
      to: BASE_SPARK_USDC,
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
  getQuote: ReturnType<typeof vi.fn>;
  getContractCallQuote: ReturnType<typeof vi.fn>;
} {
  const getSwapQuote = vi.fn();
  const getQuote = vi.fn();
  const getContractCallQuote = vi.fn();
  return {
    adapter: {
      getSwapQuote,
      getQuote,
      getContractCallQuote,
    } as unknown as LiFiAdapter,
    getSwapQuote,
    getQuote,
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
  it('encodes a direct Morpho deposit when the source token is the vault asset', async () => {
    const { adapter, getSwapQuote, getContractCallQuote } = makeAdapterMock();

    const readContract = vi.fn().mockResolvedValueOnce(BASE_USDC); // vault.asset()
    const publicClient = { readContract } as unknown as PublicClient;

    const result = await buildSupplyTx(
      {
        type: 'SUPPLY',
        fromAddress: FROM_ADDRESS,
        chainId: 8453,
        fromToken: BASE_USDC,
        fromAmount: '5000000',
        vaultAddress: BASE_SPARK_USDC,
        protocol: 'morpho',
      },
      adapter,
      publicClient,
    );

    expect(readContract).toHaveBeenCalledWith({
      address: BASE_SPARK_USDC,
      abi: MORPHO_VAULT_ABI,
      functionName: 'asset',
    });
    expect(getContractCallQuote).not.toHaveBeenCalled();
    expect(getSwapQuote).not.toHaveBeenCalled();

    expect(result.transaction.to).toBe(BASE_SPARK_USDC);
    expect(result.transaction.data.slice(0, 10)).toBe(DEPOSIT_SELECTOR);
    expect(result.transaction.value).toBe('0');
    expect(result.transaction.chainId).toBe(8453);
    expect(result.transaction.gasLimit).toBe('150000');
    expect(result.transaction.meta).toMatchObject({
      intentType: 'SUPPLY',
      estimatedGas: '150000',
      estimatedDuration: 0,
      route: { tool: 'direct' },
    });
    expect(result.transaction.meta.route).toEqual({ tool: 'direct' });
    expect(result.estimate).toEqual({
      fromAmount: '5000000',
      toAmount: '5000000',
      toAmountMin: '5000000',
      gasCostUsd: '0',
      feeCostUsd: '0',
      executionDuration: 0,
      tool: 'direct',
    });
    expect(result.route).toEqual({ tool: 'direct' });

    const decoded = decodeFunctionData({
      abi: MORPHO_VAULT_ABI,
      data: result.transaction.data as `0x${string}`,
    });
    expect(decoded.functionName).toBe('deposit');
    expect(decoded.args).toEqual([5_000_000n, FROM_ADDRESS]);
  });

  it('reads vault.asset() and requests a LI.FI Earn quote when a swap is needed', async () => {
    const { adapter, getQuote, getContractCallQuote } = makeAdapterMock();
    getQuote.mockResolvedValueOnce(makeStubQuote());

    const readContract = vi.fn().mockResolvedValueOnce(BASE_USDC); // vault.asset()
    const publicClient = { readContract } as unknown as PublicClient;

    await buildSupplyTx(
      {
        type: 'SUPPLY',
        fromAddress: FROM_ADDRESS,
        chainId: 8453,
        fromToken: BASE_WETH,
        fromAmount: '5000000',
        vaultAddress: BASE_SPARK_USDC,
        protocol: 'morpho',
      },
      adapter,
      publicClient,
    );

    expect(readContract).toHaveBeenCalledWith({
      address: BASE_SPARK_USDC,
      abi: MORPHO_VAULT_ABI,
      functionName: 'asset',
    });

    expect(getContractCallQuote).not.toHaveBeenCalled();
    const args = getQuote.mock.calls[0]?.[0];
    expect(args.fromChain).toBe(8453);
    expect(args.toChain).toBe(8453);
    expect(args.fromToken).toBe(BASE_WETH);
    expect(args.toToken).toBe(BASE_SPARK_USDC);
    expect(args.fromAmount).toBe('5000000');
    expect(args.fromAddress).toBe(FROM_ADDRESS);
    expect(args.intentType).toBe('SUPPLY');
  });
});

describe('buildWithdrawTx', () => {
  it('encodes a redeem(shares, fromAddress, fromAddress) call against the vault', () => {
    const tx = buildWithdrawTx({
      type: 'WITHDRAW',
      fromAddress: FROM_ADDRESS,
      chainId: 8453,
      vaultAddress: BASE_SPARK_USDC,
      shareAmount: '1000000000000000000',
      protocol: 'morpho',
    });

    expect(tx.to).toBe(BASE_SPARK_USDC);
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
  const vaultAssets: Record<string, Address> = {
    [BASE_SPARK_USDC.toLowerCase()]: BASE_USDC,
    [BASE_MOONWELL_WETH.toLowerCase()]: BASE_WETH,
  };

  let swapMock: ReturnType<typeof makeAdapterMock>;

  beforeEach(() => {
    readContract = vi.fn(
      ({
        address,
        functionName,
      }: {
        address: Address;
        functionName: string;
      }) => {
        if (functionName === 'previewRedeem') return Promise.resolve(994_000n);
        if (functionName === 'asset')
          return Promise.resolve(vaultAssets[address.toLowerCase()]);
        throw new Error(`unexpected read ${functionName}`);
      },
    );
    publicClient = { readContract } as unknown as PublicClient;
    swapMock = makeAdapterMock();
    swapMock.getSwapQuote.mockResolvedValue(
      makeStubQuote({
        transaction: {
          to: '0x000000000000000000000000000000000000F00D' as Address,
          data: '0xabcd',
          value: '0',
          chainId: 8453,
          gasLimit: '400000',
          meta: { intentType: 'SWAP' },
        },
        estimate: {
          fromAmount: '994000',
          toAmount: '500000000000000000',
          toAmountMin: '495000000000000000',
          gasCostUsd: '1.25',
          executionDuration: 30,
        },
      }),
    );
  });

  const rotate = (overrides: Record<string, unknown> = {}) =>
    buildRotateTx(
      {
        type: 'ROTATE',
        fromAddress: FROM_ADDRESS,
        chainId: 8453,
        fromVault: BASE_SPARK_USDC,
        toVault: BASE_MOONWELL_WETH,
        shareAmount: '1000000',
        protocol: 'morpho',
        ...overrides,
      },
      swapMock.adapter,
      publicClient,
    );

  it('redeems, swaps via LI.FI, then deposits the guaranteed minimum', async () => {
    const plan = await rotate({ slippageBps: 30 });

    expect(swapMock.getQuote).not.toHaveBeenCalled();
    expect(swapMock.getSwapQuote).toHaveBeenCalledWith({
      fromChain: 8453,
      toChain: 8453,
      fromToken: BASE_USDC,
      toToken: BASE_WETH,
      fromAmount: '994000',
      fromAddress: FROM_ADDRESS,
      toAddress: FROM_ADDRESS,
      slippageBps: 30,
    });

    expect(plan.steps).toHaveLength(3);
    const [redeem, swap, deposit] = plan.steps;
    expect(redeem?.to).toBe(BASE_SPARK_USDC);
    expect(redeem?.data.slice(0, 10)).toBe(REDEEM_SELECTOR);
    expect(swap?.to).toBe('0x000000000000000000000000000000000000F00D');
    expect(deposit?.to).toBe(BASE_MOONWELL_WETH);
    expect(deposit?.meta.intentType).toBe('ROTATE_DEPOSIT');
    expect(
      decodeFunctionData({
        abi: MORPHO_VAULT_ABI,
        data: deposit!.data as `0x${string}`,
      }).args,
    ).toEqual([495_000_000_000_000_000n, FROM_ADDRESS]);

    expect(plan.approvals).toEqual([
      {
        tokenAddress: BASE_USDC,
        spenderAddress: '0x0000000000000000000000000000000000000aaa',
        amount: '1000000',
      },
      {
        tokenAddress: BASE_WETH,
        spenderAddress: BASE_MOONWELL_WETH,
        amount: '495000000000000000',
      },
    ]);
    expect(plan).toMatchObject({
      assetToken: BASE_USDC,
      depositToken: BASE_WETH,
      redeemAmount: '994000',
      depositAmount: '495000000000000000',
      estimates: { expectedOutput: '500000000000000000', totalDuration: 30 },
    });
  });

  it('rotates the other way with the same primitive', async () => {
    const plan = await rotate({
      fromVault: BASE_MOONWELL_WETH,
      toVault: BASE_SPARK_USDC,
    });

    expect(swapMock.getSwapQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        fromToken: BASE_WETH,
        toToken: BASE_USDC,
        slippageBps: 50,
      }),
    );
    expect(plan.steps.map((step) => step.to)).toEqual([
      BASE_MOONWELL_WETH,
      '0x000000000000000000000000000000000000F00D',
      BASE_SPARK_USDC,
    ]);
  });

  it('skips the swap when both vaults hold the same asset', async () => {
    vaultAssets[BASE_MOONWELL_WETH.toLowerCase()] = BASE_USDC;
    try {
      const plan = await rotate();
      expect(swapMock.getSwapQuote).not.toHaveBeenCalled();
      expect(plan.steps.map((step) => step.to)).toEqual([
        BASE_SPARK_USDC,
        BASE_MOONWELL_WETH,
      ]);
      expect(plan.depositAmount).toBe('994000');
      expect(plan.approvals).toEqual([
        {
          tokenAddress: BASE_USDC,
          spenderAddress: BASE_MOONWELL_WETH,
          amount: '994000',
        },
      ]);
    } finally {
      vaultAssets[BASE_MOONWELL_WETH.toLowerCase()] = BASE_WETH;
    }
  });

  it('surfaces LI.FI adapter errors rather than silently succeeding', async () => {
    swapMock.getSwapQuote.mockRejectedValueOnce(new Error('LI.FI down'));

    await expect(rotate()).rejects.toThrow(/LI\.FI down/);
  });
});

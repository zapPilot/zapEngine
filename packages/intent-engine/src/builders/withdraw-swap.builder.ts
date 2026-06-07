import type { Address, PublicClient } from 'viem';

import type { LiFiAdapter } from '../adapters/lifi.adapter.js';
import { MORPHO_VAULT_ABI } from '../protocols/morpho/morpho.constants.js';
import type {
  PreparedTransaction,
  RotateTransactionPlan,
} from '../types/transaction.types.js';
import { buildWithdrawTx } from './withdraw.builder.js';

export interface BuildWithdrawSwapTxInput {
  vaultAddress: Address;
  /** Vault shares to redeem, as a wei string */
  shareAmount: string;
  /**
   * Token the user wants to receive. Omit (or pass the vault asset) to receive
   * the vault's underlying asset with no swap.
   */
  toToken?: Address;
  fromAddress: Address;
  chainId: number;
  slippageBps?: number;
}

/**
 * A withdraw-and-swap plan plus the resolved vault asset, so callers can label
 * the redeem leg / map the plan without re-reading `asset()` on-chain.
 */
export interface WithdrawSwapPlan extends RotateTransactionPlan {
  /** The vault's underlying asset (`vault.asset()`) — what redeem returns. */
  assetToken: Address;
  /** Estimated assets out of the redeem (`previewRedeem`), as a wei string. */
  redeemAmount: string;
}

function sameToken(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Build a withdraw-and-swap plan: redeem shares from a Morpho vault, then — if
 * the requested output token differs from the vault's underlying asset — swap
 * the redeemed asset into `toToken` via LI.FI, delivering the chosen token to
 * the user's own wallet. Unlike buildRotateTx the LI.FI target is a plain
 * token (intent `SWAP`), not another vault, and there is no final supply leg.
 *
 * Like rotate, the swap is quoted against `previewRedeem` — the actual redeem
 * output on execution may drift slightly (vault share price moves), which is
 * why LI.FI's slippage protection matters. The execution layer decides atomic
 * (EIP-7702) vs sequential.
 *
 * Steps returned: `[redeemTx]` when `toToken` is the vault asset, else
 * `[redeemTx, swapTx]`. Any LI.FI approval is surfaced as `approval` for the
 * execution layer to include before the swap.
 */
export async function buildWithdrawSwapTx(
  input: BuildWithdrawSwapTxInput,
  adapter: LiFiAdapter,
  publicClient: PublicClient,
): Promise<WithdrawSwapPlan> {
  // Reuse the Morpho withdraw builder for intent validation + redeem encoding.
  const redeemTx: PreparedTransaction = buildWithdrawTx({
    type: 'WITHDRAW',
    vaultAddress: input.vaultAddress,
    shareAmount: input.shareAmount,
    protocol: 'morpho',
    fromAddress: input.fromAddress,
    chainId: input.chainId,
  });

  const [previewedAssets, vaultAsset] = await Promise.all([
    publicClient.readContract({
      address: input.vaultAddress,
      abi: MORPHO_VAULT_ABI,
      functionName: 'previewRedeem',
      args: [BigInt(input.shareAmount)],
    }),
    publicClient.readContract({
      address: input.vaultAddress,
      abi: MORPHO_VAULT_ABI,
      functionName: 'asset',
    }),
  ]);

  const redeemAmount = previewedAssets as bigint;
  const assetToken = vaultAsset as Address;

  // The user wants the vault's underlying asset — redeem only, no swap.
  if (!input.toToken || sameToken(assetToken, input.toToken)) {
    return {
      steps: [redeemTx],
      estimates: {
        totalGasUsd: '0',
        totalDuration: 0,
        expectedOutput: redeemAmount.toString(),
      },
      assetToken,
      redeemAmount: redeemAmount.toString(),
    };
  }

  const swapQuote = await adapter.getSwapQuote({
    fromChain: input.chainId,
    toChain: input.chainId,
    fromToken: assetToken,
    toToken: input.toToken,
    fromAmount: redeemAmount.toString(),
    fromAddress: input.fromAddress,
    toAddress: input.fromAddress,
    slippageBps: input.slippageBps ?? 50,
  });

  return {
    steps: [redeemTx, swapQuote.transaction],
    estimates: {
      totalGasUsd: swapQuote.estimate.gasCostUsd,
      totalDuration: swapQuote.estimate.executionDuration,
      expectedOutput: swapQuote.estimate.toAmount,
    },
    approval: swapQuote.approval,
    assetToken,
    redeemAmount: redeemAmount.toString(),
  };
}

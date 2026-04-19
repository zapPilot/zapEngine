import type { Address, PublicClient } from 'viem';

import type { LiFiAdapter } from '../adapters/lifi.adapter.js';
import {
  MORPHO_GAS_ESTIMATES,
  MORPHO_VAULT_ABI,
} from '../protocols/morpho/morpho.constants.js';
import {
  encodeDeposit,
  encodeRedeem,
} from '../protocols/morpho/morpho.encoder.js';
import type { RotateIntentInput } from '../types/intent.types.js';
import type {
  PreparedTransaction,
  RotateTransactionPlan,
} from '../types/transaction.types.js';
import { validateRotateIntent } from '../validators/intent.validator.js';

/**
 * Build an atomic rotate plan: redeem shares from one Morpho vault, swap
 * underlying if needed, deposit into another vault.
 *
 * Unlike a naive two-phase flow, this returns one plan in a single call:
 *   1. `previewRedeem` on-chain to estimate the assets-out of the redeem
 *   2. Read both vaults' `asset()` to know what token LI.FI bridges between
 *   3. Get a LI.FI contract-calls quote that swaps `fromAsset → toAsset`
 *      and calls `deposit(amount, receiver)` on the destination vault
 *
 * The estimate is optimistic — the actual `redeem` output on execution may
 * drift slightly (vault share price moves), which is why LI.FI's slippage
 * protection matters. Execution layer decides atomic (EIP-7702) vs
 * sequential (Multicall3 + approval).
 *
 * Steps returned: `[redeemTx, lifiSupplyTx]`. If the LI.FI quote carries
 * an approval, it is attached to the plan as `approval` for the execution
 * layer to include before the LI.FI call.
 */
export async function buildRotateTx(
  intent: RotateIntentInput,
  adapter: LiFiAdapter,
  publicClient: PublicClient,
): Promise<RotateTransactionPlan> {
  const validated = validateRotateIntent(intent);

  const [previewedAssets, fromVaultAsset, toVaultAsset] = await Promise.all([
    publicClient.readContract({
      address: validated.fromVault as Address,
      abi: MORPHO_VAULT_ABI,
      functionName: 'previewRedeem',
      args: [BigInt(validated.shareAmount)],
    }),
    publicClient.readContract({
      address: validated.fromVault as Address,
      abi: MORPHO_VAULT_ABI,
      functionName: 'asset',
    }),
    publicClient.readContract({
      address: validated.toVault as Address,
      abi: MORPHO_VAULT_ABI,
      functionName: 'asset',
    }),
  ]);

  const redeemAmount = previewedAssets as bigint;

  const redeemTx: PreparedTransaction = {
    to: validated.fromVault,
    data: encodeRedeem(
      BigInt(validated.shareAmount),
      validated.fromAddress as Address,
      validated.fromAddress as Address,
    ),
    value: '0',
    chainId: validated.chainId,
    gasLimit: MORPHO_GAS_ESTIMATES.redeem,
    meta: {
      intentId: validated.id,
      intentType: 'ROTATE_WITHDRAW',
      estimatedGas: MORPHO_GAS_ESTIMATES.redeem,
    },
  };

  const depositCalldata = encodeDeposit(
    redeemAmount,
    validated.fromAddress as Address,
  );

  const supplyQuote = await adapter.getContractCallQuote({
    fromChain: validated.chainId,
    toChain: validated.chainId,
    fromToken: fromVaultAsset as Address,
    toToken: toVaultAsset as Address,
    toAmount: redeemAmount.toString(),
    fromAddress: validated.fromAddress as Address,
    contractCalls: [
      {
        fromAmount: redeemAmount.toString(),
        fromTokenAddress: toVaultAsset as Address,
        toContractAddress: validated.toVault as Address,
        toContractCallData: depositCalldata,
        toContractGasLimit: MORPHO_GAS_ESTIMATES.deposit,
      },
    ],
  });

  return {
    steps: [redeemTx, supplyQuote.transaction],
    estimates: {
      totalGasUsd: supplyQuote.estimate.gasCostUsd,
      totalDuration: supplyQuote.estimate.executionDuration,
      expectedOutput: supplyQuote.estimate.toAmount,
    },
    approval: supplyQuote.approval,
    strategy: undefined,
  };
}

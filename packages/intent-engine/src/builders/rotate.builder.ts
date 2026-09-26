import type { Address, PublicClient } from 'viem';

import type { LiFiAdapter } from '../adapters/lifi.adapter.js';
import {
  MORPHO_GAS_ESTIMATES,
  MORPHO_VAULT_ABI,
} from '../protocols/morpho/morpho.constants.js';
import { encodeDeposit } from '../protocols/morpho/morpho.encoder.js';
import type { RotateIntentInput } from '../types/intent.types.js';
import type {
  PreparedTransaction,
  RotatePlan,
} from '../types/transaction.types.js';
import { validateRotateIntent } from '../validators/intent.validator.js';
import { buildWithdrawSwapTx } from './withdraw-swap.builder.js';

/**
 * Build a vault-to-vault rotation as plain, separately executable steps:
 *   1. redeem `shareAmount` shares from `fromVault`
 *   2. swap the redeemed asset into `toVault.asset()` via LI.FI, only when the
 *      two vaults hold different assets
 *   3. deposit into `toVault`
 *
 * The deposit amount has to be fixed when the plan is built, before the swap
 * fills, so it is the swap's guaranteed minimum output. A better fill stays
 * idle in the wallet instead of making the deposit amount depend on
 * execution. The redeem and deposit are ordinary vault calls; only the swap
 * carries LI.FI calldata.
 *
 * Steps returned: `[redeemTx, swapTx, depositTx]`, or `[redeemTx, depositTx]`
 * for a same-asset rotation. `approvals` lists the swap approval (if LI.FI
 * needs one) and the destination-asset approval for the deposit.
 */
export async function buildRotateTx(
  intent: RotateIntentInput,
  adapter: LiFiAdapter,
  publicClient: PublicClient,
): Promise<RotatePlan> {
  const validated = validateRotateIntent(intent);
  const fromAddress = validated.fromAddress as Address;
  const toVault = validated.toVault as Address;

  const depositToken = (await publicClient.readContract({
    address: toVault,
    abi: MORPHO_VAULT_ABI,
    functionName: 'asset',
  })) as Address;

  const withdrawSwap = await buildWithdrawSwapTx(
    {
      vaultAddress: validated.fromVault as Address,
      shareAmount: validated.shareAmount,
      toToken: depositToken,
      fromAddress,
      chainId: validated.chainId,
      slippageBps: validated.slippageBps,
    },
    adapter,
    publicClient,
  );
  const depositAmount = withdrawSwap.minOutput;

  const depositTx: PreparedTransaction = {
    to: toVault,
    data: encodeDeposit(BigInt(depositAmount), fromAddress),
    value: '0',
    chainId: validated.chainId,
    gasLimit: MORPHO_GAS_ESTIMATES.deposit,
    meta: {
      intentId: validated.id,
      intentType: 'ROTATE_DEPOSIT',
      estimatedGas: MORPHO_GAS_ESTIMATES.deposit,
    },
  };

  return {
    steps: [...withdrawSwap.steps, depositTx],
    approvals: [
      ...(withdrawSwap.approval ? [withdrawSwap.approval] : []),
      {
        tokenAddress: depositToken,
        spenderAddress: toVault,
        amount: depositAmount,
      },
    ],
    assetToken: withdrawSwap.assetToken,
    depositToken,
    redeemAmount: withdrawSwap.redeemAmount,
    depositAmount,
    estimates: withdrawSwap.estimates,
  };
}

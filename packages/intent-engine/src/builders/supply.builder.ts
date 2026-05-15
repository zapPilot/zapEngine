import type { Address, PublicClient } from 'viem';

import type { LiFiAdapter } from '../adapters/lifi.adapter.js';
import {
  MORPHO_GAS_ESTIMATES,
  MORPHO_VAULT_ABI,
} from '../protocols/morpho/morpho.constants.js';
import { encodeDeposit } from '../protocols/morpho/morpho.encoder.js';
import type { SupplyIntentInput } from '../types/intent.types.js';
import type { TransactionQuote } from '../types/transaction.types.js';
import { validateSupplyIntent } from '../validators/intent.validator.js';

/**
 * Build a supply (deposit) transaction for a Morpho vault.
 *
 * Uses LI.FI's contract-calls quote (not `getQuote` with `toToken=vault`), so
 * it works for any ERC-4626 vault regardless of whether LI.FI has indexed it:
 *   1. Read the vault's underlying asset via `vault.asset()`
 *   2. Encode `deposit(assets, receiver)` calldata
 *   3. If `fromToken === vaultAsset`, return the deposit call directly
 *   4. Otherwise ask LI.FI to route `fromToken → vaultAsset` and invoke it
 *
 * Direct asset deposits intentionally avoid LI.FI so the ERC-4626 path keeps
 * working when quote infrastructure is unavailable.
 */
export async function buildSupplyTx(
  intent: SupplyIntentInput,
  adapter: LiFiAdapter,
  publicClient: PublicClient,
): Promise<TransactionQuote> {
  const validated = validateSupplyIntent(intent);

  const vaultAsset = (await publicClient.readContract({
    address: validated.vaultAddress as Address,
    abi: MORPHO_VAULT_ABI,
    functionName: 'asset',
  })) as Address;

  const depositCalldata = encodeDeposit(
    BigInt(validated.fromAmount),
    validated.fromAddress as Address,
  );

  const isDirectDeposit =
    validated.fromToken.toLowerCase() === vaultAsset.toLowerCase();

  if (isDirectDeposit) {
    return {
      transaction: {
        to: validated.vaultAddress as Address,
        data: depositCalldata,
        value: '0',
        chainId: validated.chainId,
        gasLimit: MORPHO_GAS_ESTIMATES.deposit,
        meta: {
          intentType: 'SUPPLY',
          estimatedGas: MORPHO_GAS_ESTIMATES.deposit,
          estimatedDuration: 0,
          route: { tool: 'direct' },
        },
      },
      estimate: {
        fromAmount: validated.fromAmount,
        toAmount: validated.fromAmount,
        toAmountMin: validated.fromAmount,
        gasCostUsd: '0',
        executionDuration: 0,
      },
      route: { tool: 'direct' },
    };
  }

  return adapter.getContractCallQuote({
    fromChain: validated.chainId,
    toChain: validated.chainId,
    fromToken: validated.fromToken as Address,
    toToken: vaultAsset,
    toAmount: validated.fromAmount,
    fromAddress: validated.fromAddress as Address,
    contractCalls: [
      {
        fromAmount: validated.fromAmount,
        fromTokenAddress: vaultAsset,
        toContractAddress: validated.vaultAddress as Address,
        toContractCallData: depositCalldata,
        toContractGasLimit: MORPHO_GAS_ESTIMATES.deposit,
      },
    ],
  });
}

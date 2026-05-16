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
 * Direct vault-asset deposits avoid LI.FI so the ERC-4626 path keeps working
 * when quote infrastructure is unavailable. Other source tokens use LI.FI's
 * Earn/Composer quote with `toToken=vaultAddress`, so LI.FI can route the exact
 * source input amount and deposit the resulting vault asset amount safely:
 *   1. Read the vault's underlying asset via `vault.asset()`
 *   2. If `fromToken === vaultAsset`, encode and return the deposit directly
 *   3. Otherwise ask LI.FI to route `fromToken → vault` as an exact-input quote
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

  const isDirectDeposit =
    validated.fromToken.toLowerCase() === vaultAsset.toLowerCase();

  if (isDirectDeposit) {
    const depositCalldata = encodeDeposit(
      BigInt(validated.fromAmount),
      validated.fromAddress as Address,
    );

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

  return adapter.getQuote({
    fromChain: validated.chainId,
    toChain: validated.chainId,
    fromToken: validated.fromToken as Address,
    toToken: validated.vaultAddress as Address,
    fromAmount: validated.fromAmount,
    fromAddress: validated.fromAddress as Address,
    slippageBps: 50,
    intentType: 'SUPPLY',
  });
}

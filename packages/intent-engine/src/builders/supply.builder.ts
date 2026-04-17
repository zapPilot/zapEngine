import type { Address, PublicClient } from 'viem';

import type { LiFiAdapter } from '../adapters/lifi.adapter.js';
import { MORPHO_GAS_ESTIMATES, MORPHO_VAULT_ABI } from '../protocols/morpho/morpho.constants.js';
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
 *   3. Ask LI.FI to route `fromToken → vaultAsset` and invoke the deposit
 *
 * When `fromToken` already equals `vault.asset()`, LI.FI returns a
 * no-swap route that directly calls the vault.
 */
export async function buildSupplyTx(
  intent: SupplyIntentInput,
  adapter: LiFiAdapter,
  publicClient: PublicClient
): Promise<TransactionQuote> {
  const validated = validateSupplyIntent(intent);

  const vaultAsset = (await publicClient.readContract({
    address: validated.vaultAddress as Address,
    abi: MORPHO_VAULT_ABI,
    functionName: 'asset',
  })) as Address;

  const depositCalldata = encodeDeposit(
    BigInt(validated.fromAmount),
    validated.fromAddress as Address
  );

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

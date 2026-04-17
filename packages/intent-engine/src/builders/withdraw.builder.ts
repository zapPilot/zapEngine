import type { Address } from 'viem';

import type { WithdrawIntentInput } from '../types/intent.types.js';
import type { PreparedTransaction } from '../types/transaction.types.js';
import { encodeRedeem } from '../protocols/morpho/morpho.encoder.js';
import { MORPHO_GAS_ESTIMATES } from '../protocols/morpho/morpho.constants.js';
import { validateWithdrawIntent } from '../validators/intent.validator.js';

/**
 * Build a withdraw transaction for Morpho vault
 *
 * Direct contract call (no LI.FI needed). Uses redeem() to burn shares and
 * receive the vault's underlying asset (whatever `vault.asset()` returns).
 *
 * For withdrawals that also need swapping, use buildRotateTx instead.
 */
export function buildWithdrawTx(intent: WithdrawIntentInput): PreparedTransaction {
  // Validate intent (throws on invalid)
  const validated = validateWithdrawIntent(intent);

  const calldata = encodeRedeem(
    BigInt(validated.shareAmount),
    validated.fromAddress as Address,
    validated.fromAddress as Address
  );

  return {
    to: validated.vaultAddress,
    data: calldata,
    value: '0',
    chainId: validated.chainId,
    gasLimit: MORPHO_GAS_ESTIMATES.redeem,
    meta: {
      intentId: validated.id,
      intentType: 'WITHDRAW',
      estimatedGas: MORPHO_GAS_ESTIMATES.redeem,
    },
  };
}

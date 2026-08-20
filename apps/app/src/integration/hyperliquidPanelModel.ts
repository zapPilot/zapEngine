import { HYPERCORE_CHAIN_ID } from '@zapengine/app-core/config/chains/display';
import type {
  WizardHlpStatus,
  WizardStage,
} from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import type { ChainSplit } from '@zapengine/types/api';

/**
 * Pins the whole deposit to HyperCore instead of relying on the backend's
 * `DEPOSIT_DEFAULT_SPLIT` rollout env, which currently routes Base-only.
 */
export const HYPERLIQUID_HLP_SPLIT: ChainSplit = {
  [String(HYPERCORE_CHAIN_ID)]: 1,
};

/**
 * The vault minimum is enforced on the bridge *output* ($5 of perp USDC), so
 * the input needs headroom for slippage and the relay fee. Below this the
 * backend rejects the plan with a 400 rather than returning a route.
 */
export const MIN_HYPERLIQUID_DEPOSIT_USD6 = 6_000_000n;

export function belowHlpMinimum(fromAmountUsd6: string): boolean {
  const amount = BigInt(fromAmountUsd6);
  return amount > 0n && amount < MIN_HYPERLIQUID_DEPOSIT_USD6;
}

/** Completion-card status line — the HLP leg may end unconfirmed. */
export function hlpDoneStatusLabel(status: WizardHlpStatus): string {
  if (status === 'deposited') {
    return 'Deposited (incl. HLP)';
  }
  if (status === 'submittedUnverified') {
    return 'HLP deposit submitted — awaiting confirmation';
  }
  return 'Deposited';
}

/**
 * Only the HLP deposit itself is safely repeatable: the wizard rewinds it to
 * `arrived` on failure. Anything earlier already moved funds on Base, so the
 * user has to start over from setup.
 */
export function hlpErrorAction(stage: WizardStage): 'retry' | 'reset' {
  return stage === 'hyperliquidDeposit' ? 'retry' : 'reset';
}

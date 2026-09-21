import type { HyperliquidAgentSessionStatus } from '@zapengine/app-core/hooks/useHyperliquidAgentSession';
import type { HyperCoreAccountMode } from '@zapengine/app-core/services/hyperliquidService';
import { formatUnits } from 'viem';

import { hlpSpotSignatureLabel } from '@/integration/hlpSpotDepositModel';
import { hlpAccountModeLabel } from '@/integration/hyperliquidPanelModel';
import type { StageSummaryRow } from '@/integration/investReviewModel';

/**
 * This card sits between two Tenderly-backed batches, so it has to say what it
 * is not: a HyperCore exchange action has no EVM transaction to simulate.
 */
export const HYPERCORE_LEG_NOT_SIMULATED =
  'Not simulated — this is a Hyperliquid exchange action, not an EVM transaction.';

export const HYPERCORE_LEG_TITLE = 'Hyperliquid · HLP';
export const HYPERCORE_LEG_ACTION = 'Deposit HyperCore USDC into the HLP vault';

function usd(value: bigint | null): string {
  return value === null ? '—' : `${formatUnits(value, 6)} USDC`;
}

/**
 * The same facts the standalone HyperCore deposit screen showed, plus the
 * withdrawal lock the bridged route already discloses in its own summary rows.
 */
export function hyperCoreLegReviewRows(input: {
  requestedUsd6: bigint;
  spendableUsd6: bigint | null;
  accountMode: HyperCoreAccountMode | null;
  lockupDays: number | null;
  agentStatus: HyperliquidAgentSessionStatus;
}): StageSummaryRow[] {
  return [
    { label: 'Deposit', value: usd(input.requestedUsd6) },
    { label: 'Available on Hyperliquid', value: usd(input.spendableUsd6) },
    {
      label: 'Account mode',
      value: input.accountMode ? hlpAccountModeLabel(input.accountMode) : '—',
    },
    { label: 'Route', value: 'Hyperliquid balance → HLP vault' },
    { label: 'Destination', value: 'Official HLP vault' },
    {
      label: 'Withdrawal lock',
      value:
        input.lockupDays === null
          ? '—'
          : `${input.lockupDays} days after deposit`,
    },
    { label: 'Network fee', value: 'None — no gas' },
    { label: 'Signatures', value: hlpSpotSignatureLabel(input.agentStatus) },
  ];
}

/** Step 2's lead paragraph, which must count the agent-signed leg separately. */
export function investSignatureSummary(input: {
  batchCount: number;
  hasHyperCoreLeg: boolean;
}): string {
  const batches = `You'll sign ${input.batchCount} ${
    input.batchCount === 1 ? 'transaction' : 'transactions'
  }, one per chain — each later one continues on its own after a quick re-check.`;
  return input.hasHyperCoreLeg
    ? `${batches} The HLP deposit needs no wallet transaction: your approved Hyperliquid agent signs it.`
    : batches;
}

/** Closing line under the confirm button. */
export function investAgentDisclaimer(input: {
  hasBridgedHlp: boolean;
  hasHyperCoreLeg: boolean;
}): string {
  if (input.hasHyperCoreLeg) {
    return '; the HLP vault deposit is signed by your approved Hyperliquid agent, straight from the USDC already on Hyperliquid.';
  }
  return input.hasBridgedHlp
    ? '; the final HLP vault deposit is signed by your approved Hyperliquid agent once USDC arrives on Hyperliquid.'
    : '.';
}

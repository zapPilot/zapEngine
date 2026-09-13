import type { Address } from 'viem';

interface HlpSubmissionPorts<TResult> {
  /** Pre-bridge account-mode-aware spendable HyperCore USDC. */
  readSpendableUsd6: (input: {
    user: Address;
    apiUrl: string;
  }) => Promise<bigint>;
  /** Records the snapshot the HLP follow-up measures its delta against. */
  setBaselineUsd6: (value: string) => void;
  /** Hands the exact reviewed source batch to the wallet. */
  submitReviewedBatch: () => Promise<TResult>;
}

/**
 * Starts an HLP deposit in the only safe order: the account-mode-aware
 * HyperCore snapshot is recorded before the reviewed batch can move any USDC.
 * The submit result is passed straight back so callers can branch on it.
 */
export async function startHlpSubmission<TResult>(
  target: { user: Address; apiUrl: string },
  ports: HlpSubmissionPorts<TResult>,
): Promise<TResult> {
  const spendableUsd6 = await ports.readSpendableUsd6(target);
  ports.setBaselineUsd6(spendableUsd6.toString());
  return ports.submitReviewedBatch();
}

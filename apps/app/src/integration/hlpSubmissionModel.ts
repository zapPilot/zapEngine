import type { Address } from 'viem';

interface HlpSubmissionPorts {
  /** Pre-bridge account-mode-aware spendable HyperCore USDC. */
  readSpendableUsd6: (input: {
    user: Address;
    apiUrl: string;
  }) => Promise<bigint>;
  /** Records the snapshot the HLP follow-up measures its delta against. */
  setBaselineUsd6: (value: string) => void;
  /** Hands the exact reviewed Base batch to the wallet. */
  submitReviewedBatch: () => Promise<void>;
}

/**
 * Starts an HLP deposit in the only safe order: the account-mode-aware
 * HyperCore snapshot is recorded before the reviewed batch can move any USDC.
 */
export async function startHlpSubmission(
  target: { user: Address; apiUrl: string },
  ports: HlpSubmissionPorts,
): Promise<void> {
  const spendableUsd6 = await ports.readSpendableUsd6(target);
  ports.setBaselineUsd6(spendableUsd6.toString());
  await ports.submitReviewedBatch();
}

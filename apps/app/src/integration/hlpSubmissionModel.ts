import type { Address } from 'viem';

interface HlpSubmissionPorts {
  /** Pre-bridge HyperCore withdrawable balance of the funding wallet. */
  readWithdrawableUsd6: (input: {
    user: Address;
    apiUrl: string;
  }) => Promise<bigint>;
  /** Records the snapshot the HLP follow-up measures its delta against. */
  setBaselineUsd6: (value: string) => void;
  /** Hands the exact reviewed Base batch to the wallet. */
  submitReviewedBatch: () => Promise<void>;
}

/**
 * Starts an HLP deposit in the only safe order: the HyperCore snapshot is
 * recorded before the reviewed batch can move any USDC, because the follow-up
 * deposits the balance delta measured against that snapshot. A failed read
 * therefore has to abort the submission — measuring against a post-bridge
 * balance would sweep perp USDC the user already held into a days-long lock.
 */
export async function startHlpSubmission(
  target: { user: Address; apiUrl: string },
  ports: HlpSubmissionPorts,
): Promise<void> {
  const withdrawableUsd6 = await ports.readWithdrawableUsd6(target);
  ports.setBaselineUsd6(withdrawableUsd6.toString());
  await ports.submitReviewedBatch();
}

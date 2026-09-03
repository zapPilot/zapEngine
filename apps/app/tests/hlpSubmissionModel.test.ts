import { describe, expect, it, vi } from 'vitest';

import { startHlpSubmission } from '@/integration/hlpSubmissionModel';

const TARGET = {
  user: '0x1111111111111111111111111111111111111111' as `0x${string}`,
  apiUrl: 'https://api.hyperliquid.xyz',
};

describe('startHlpSubmission', () => {
  it('records the pre-bridge snapshot before the batch can move funds', async () => {
    const order: string[] = [];
    const setBaselineUsd6 = vi.fn((value: string) => {
      order.push(`baseline:${value}`);
    });
    const submitReviewedBatch = vi.fn(async () => {
      order.push('submit');
    });

    await startHlpSubmission(TARGET, {
      readWithdrawableUsd6: async (input) => {
        expect(input).toEqual(TARGET);
        order.push('read');
        return 7_250_000n;
      },
      setBaselineUsd6,
      submitReviewedBatch,
    });

    // The follow-up deposits the delta against this snapshot, so a baseline
    // taken after the bridge would sweep pre-existing perp USDC.
    expect(order).toEqual(['read', 'baseline:7250000', 'submit']);
    expect(setBaselineUsd6).toHaveBeenCalledWith('7250000');
  });

  it('does not submit when the snapshot read fails', async () => {
    const setBaselineUsd6 = vi.fn();
    const submitReviewedBatch = vi.fn(async () => undefined);

    await expect(
      startHlpSubmission(TARGET, {
        readWithdrawableUsd6: async () => {
          throw new Error('Hyperliquid info request failed.');
        },
        setBaselineUsd6,
        submitReviewedBatch,
      }),
    ).rejects.toThrow('Hyperliquid info request failed.');

    expect(setBaselineUsd6).not.toHaveBeenCalled();
    expect(submitReviewedBatch).not.toHaveBeenCalled();
  });
});

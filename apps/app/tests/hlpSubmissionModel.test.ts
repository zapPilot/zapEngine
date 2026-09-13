import { describe, expect, it, vi } from 'vitest';

import { startHlpSubmission } from '@/integration/hlpSubmissionModel';

const TARGET = {
  user: '0x1111111111111111111111111111111111111111' as `0x${string}`,
  apiUrl: 'https://api.hyperliquid.xyz',
};

describe('startHlpSubmission', () => {
  it('records the pre-bridge spendable snapshot before the batch can move funds', async () => {
    const order: string[] = [];
    const setBaselineUsd6 = vi.fn((value: string) => {
      order.push(`baseline:${value}`);
    });
    const submitReviewedBatch = vi.fn(async () => {
      order.push('submit');
    });

    await startHlpSubmission(TARGET, {
      readSpendableUsd6: async (input) => {
        expect(input).toEqual(TARGET);
        order.push('read');
        return 7_250_000n;
      },
      setBaselineUsd6,
      submitReviewedBatch,
    });

    // The follow-up deposits the delta against this snapshot, so a baseline
    // taken after the bridge would sweep USDC the user already held.
    expect(order).toEqual(['read', 'baseline:7250000', 'submit']);
    expect(setBaselineUsd6).toHaveBeenCalledWith('7250000');
  });

  it('returns the submit result so callers can branch on it', async () => {
    const result = await startHlpSubmission(TARGET, {
      readSpendableUsd6: async () => 1_000_000n,
      setBaselineUsd6: vi.fn(),
      submitReviewedBatch: async () =>
        ({ status: 'blocked', reason: 'wallet changed' }) as const,
    });

    expect(result).toEqual({ status: 'blocked', reason: 'wallet changed' });
  });

  it('does not submit when the spendable snapshot read fails', async () => {
    const setBaselineUsd6 = vi.fn();
    const submitReviewedBatch = vi.fn(async () => undefined);

    await expect(
      startHlpSubmission(TARGET, {
        readSpendableUsd6: async () => {
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

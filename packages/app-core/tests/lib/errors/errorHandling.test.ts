import { wrapServiceCall } from '@core/lib/errors/errorHandling';
import { describe, expect, it } from 'vitest';

describe('wrapServiceCall', () => {
  // Invariant: both value-returning and void operations use the same successful
  // result envelope without inventing an error field.
  it('wraps successful value and void operations', async () => {
    await expect(
      wrapServiceCall(async () => ({ id: 'user-1' })),
    ).resolves.toEqual({
      success: true,
      data: { id: 'user-1' },
    });
    await expect(wrapServiceCall(async () => undefined)).resolves.toEqual({
      success: true,
      data: undefined,
    });
  });

  // Invariant: Error messages cross the service boundary, but arbitrary
  // rejection values are normalized instead of being stringified or exposed.
  it.each([
    [new Error('account unavailable'), 'account unavailable'],
    ['account unavailable', 'Unknown error occurred'],
    [null, 'Unknown error occurred'],
  ])('normalizes rejection %#', async (rejection, expected) => {
    await expect(
      wrapServiceCall(async () => Promise.reject(rejection)),
    ).resolves.toEqual({ success: false, error: expected });
  });
});

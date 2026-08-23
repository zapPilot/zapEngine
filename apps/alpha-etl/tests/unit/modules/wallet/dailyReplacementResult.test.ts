import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyWriteResult } from '../../../../src/core/database/baseWriter.js';
import { recordReplacementResult } from '../../../../src/modules/wallet/dailyReplacement.js';

const { infoMock } = vi.hoisted(() => ({
  infoMock: vi.fn(),
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: infoMock,
    warn: vi.fn(),
  },
}));

describe('recordReplacementResult', () => {
  beforeEach(() => {
    infoMock.mockReset();
  });

  it('records the replacement count and logs success metadata', async () => {
    const result = createEmptyWriteResult();
    const replace = vi.fn().mockResolvedValue(7);

    await expect(
      recordReplacementResult(result, 3, 'Daily replacement completed', replace),
    ).resolves.toBe(result);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      recordsInserted: 7,
      errors: [],
      duplicatesSkipped: 0,
    });
    expect(infoMock).toHaveBeenCalledTimes(1);
    expect(infoMock).toHaveBeenCalledWith('Daily replacement completed', {
      records: 7,
      walletDays: 3,
    });
  });

  it('preserves prior inserted counts, appends the write error, and does not log success', async () => {
    const result = createEmptyWriteResult();
    result.recordsInserted = 5;
    result.errors.push('earlier warning');
    const replace = vi.fn().mockRejectedValue(new Error('replacement failed'));

    await expect(
      recordReplacementResult(result, 2, 'Daily replacement completed', replace),
    ).resolves.toBe(result);

    expect(result).toEqual({
      success: false,
      recordsInserted: 5,
      errors: ['earlier warning', 'replacement failed'],
      duplicatesSkipped: 0,
    });
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('normalizes non-Error replacement rejections without losing prior result state', async () => {
    const result = createEmptyWriteResult();
    result.recordsInserted = 4;
    result.errors.push('earlier warning');
    const replace = vi.fn().mockRejectedValue('replacement rejected');

    await expect(
      recordReplacementResult(result, 1, 'Daily replacement completed', replace),
    ).resolves.toBe(result);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: false,
      recordsInserted: 4,
      errors: ['earlier warning', 'replacement rejected'],
      duplicatesSkipped: 0,
    });
    expect(infoMock).not.toHaveBeenCalled();
  });
});

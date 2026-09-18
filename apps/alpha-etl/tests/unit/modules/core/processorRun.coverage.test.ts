import { describe, expect, it, vi } from 'vitest';

import { logProcessorFailureAndRethrow } from '../../../../src/modules/core/processorRun.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('processorRun coverage', () => {
  it('rethrows non-Error failures without a stack', () => {
    expect(() =>
      logProcessorFailureAndRethrow(
        'backfill blew up',
        { symbol: 'SPY' },
        'plain string failure',
      ),
    ).toThrow('plain string failure');
  });
});

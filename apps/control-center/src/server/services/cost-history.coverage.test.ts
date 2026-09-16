import { describe, expect, it, vi } from 'vitest';

import { loadCostHistory } from './cost-history.js';
import type { CostRepository } from './cost-repository.js';

describe('loadCostHistory coverage', () => {
  it('defaults now to the current time when omitted', async () => {
    const history = {
      currentMonthDaily: [],
      monthlyTotals: [],
      cashSpendUsd: null,
      previousMonthByProvider: [],
    };
    const loadHistory = vi.fn().mockResolvedValue(history);
    const repository = { loadHistory } as unknown as CostRepository;

    await expect(loadCostHistory({ repository })).resolves.toBe(history);
    expect(loadHistory).toHaveBeenCalledTimes(1);
    const [now] = loadHistory.mock.calls[0] as [Date];
    expect(now).toBeInstanceOf(Date);
  });

  it('forwards an explicit now to the repository', async () => {
    const now = new Date('2026-09-03T12:00:00.000Z');
    const history = {
      currentMonthDaily: [],
      monthlyTotals: [],
      cashSpendUsd: 1,
      previousMonthByProvider: [],
    };
    const loadHistory = vi.fn().mockResolvedValue(history);
    const repository = { loadHistory } as unknown as CostRepository;

    await expect(loadCostHistory({ repository, now })).resolves.toBe(history);
    expect(loadHistory).toHaveBeenCalledWith(now);
  });
});

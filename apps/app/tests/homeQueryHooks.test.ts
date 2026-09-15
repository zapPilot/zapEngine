import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useHyperCoreSpendable } from '@/integration/useHlpBalances';
import { useHomeBorrowingRisk } from '@/integration/useHomeBorrowingRisk';
import { useHomeIncome } from '@/integration/useHomeIncome';

const mocks = vi.hoisted(() => ({
  borrowingKey: vi.fn((id: string) => ['borrowing', id]),
  createQueryConfig: vi.fn(() => ({ retry: 2 })),
  getBorrowingPositions: vi.fn(),
  getHyperCoreSpendableUsdc: vi.fn(),
  useQuery: vi.fn(),
  useYieldSummary: vi.fn(),
}));

vi.mock('react', () => ({
  useMemo: <T>(factory: () => T): T => factory(),
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }));
vi.mock('@zapengine/app-core/hooks/queries', () => ({
  createQueryConfig: mocks.createQueryConfig,
}));
vi.mock('@zapengine/app-core/hooks/queries/queryDefaults', () => ({
  createQueryConfig: mocks.createQueryConfig,
}));
vi.mock('@zapengine/app-core/lib/state/queryClient', () => ({
  queryKeys: { portfolio: { borrowingPositions: mocks.borrowingKey } },
}));
vi.mock('@zapengine/app-core/services', () => ({
  getBorrowingPositions: mocks.getBorrowingPositions,
  getHyperCoreSpendableUsdc: mocks.getHyperCoreSpendableUsdc,
}));
vi.mock('@zapengine/app-core/hooks/queries/analytics/useYieldSummary', () => ({
  useYieldSummary: mocks.useYieldSummary,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getBorrowingPositions.mockResolvedValue([]);
  mocks.getHyperCoreSpendableUsdc.mockResolvedValue({ spendableUsdc: '12' });
  mocks.useQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn().mockResolvedValue({ data: undefined }),
  });
  mocks.useYieldSummary.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });
});

describe('useHomeBorrowingRisk', () => {
  it('normalizes a blank subject into a disabled query whose guard still rejects', async () => {
    expect(useHomeBorrowingRisk('   ').risk).toBeNull();
    const options = mocks.useQuery.mock.calls[0]?.[0] as {
      enabled: boolean;
      queryKey: unknown;
      queryFn: () => Promise<unknown>;
    };
    expect(options).toMatchObject({ enabled: false, queryKey: [] });
    await expect(options.queryFn()).rejects.toThrow(
      'userId is required to fetch borrowing positions',
    );
  });

  it('fetches a trimmed subject and maps its borrowing risk', async () => {
    const emptyBorrowing = {
      positions: [],
      total_collateral_usd: 0,
      total_debt_usd: 0,
      worst_health_rate: 0,
      last_updated: '2026-09-11T00:00:00Z',
    };
    mocks.getBorrowingPositions.mockResolvedValue(emptyBorrowing);
    mocks.useQuery.mockReturnValueOnce({
      data: emptyBorrowing,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    expect(useHomeBorrowingRisk(' user-1 ').risk).toBeNull();
    const options = mocks.useQuery.mock.calls[0]?.[0] as {
      enabled: boolean;
      queryKey: unknown;
      queryFn: () => Promise<unknown>;
    };
    expect(options).toMatchObject({
      enabled: true,
      queryKey: ['borrowing', 'user-1'],
      retry: 2,
    });
    await expect(options.queryFn()).resolves.toEqual(emptyBorrowing);
    expect(mocks.getBorrowingPositions).toHaveBeenCalledWith('user-1');
  });
});

describe('useHyperCoreSpendable', () => {
  it('keeps loading false while disabled and exposes the original refetch', async () => {
    const refetch = vi.fn().mockResolvedValue({ data: 'fresh' });
    mocks.useQuery.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: true,
      refetch,
    });

    const result = useHyperCoreSpendable(null);
    expect(result).toMatchObject({
      balance: undefined,
      isLoading: false,
      isError: true,
    });
    await expect(result.refetch()).resolves.toEqual({ data: 'fresh' });
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('configures and executes the volatile spendable-balance query', async () => {
    mocks.useQuery.mockReturnValueOnce({
      data: { spendableUsdc: '12' },
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    expect(useHyperCoreSpendable('0xabc')).toMatchObject({
      balance: { spendableUsdc: '12' },
      isLoading: true,
      isError: false,
    });
    const options = mocks.useQuery.mock.calls[0]?.[0] as {
      enabled: boolean;
      queryKey: unknown;
      queryFn: () => Promise<unknown>;
      staleTime: number;
    };
    expect(options).toMatchObject({
      enabled: true,
      queryKey: ['hlp', 'spendable', '0xabc'],
      staleTime: 60_000,
    });
    await expect(options.queryFn()).resolves.toEqual({ spendableUsdc: '12' });
    expect(mocks.getHyperCoreSpendableUsdc).toHaveBeenCalledWith({
      user: '0xabc',
    });
  });
});

describe('useHomeIncome', () => {
  it('combines yield state with the borrowing empty state', () => {
    mocks.useYieldSummary.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: true,
    });

    expect(useHomeIncome(null)).toEqual({
      income: {
        status: 'empty',
        passiveMonthlyUsd: 0,
        incomeMonthlyUsd: 0,
        costMonthlyUsd: 0,
        medianDailyUsd: 0,
        windowDays: 30,
        observedDays: 0,
        protocolRows: [],
      },
      borrowingRisk: null,
      isLoading: true,
      isError: true,
    });
    expect(mocks.useYieldSummary).toHaveBeenCalledWith(undefined);
  });

  it('passes a concrete analytics subject to both data sources', () => {
    useHomeIncome('user-2');

    expect(mocks.useYieldSummary).toHaveBeenCalledWith('user-2');
    expect(mocks.borrowingKey).toHaveBeenCalledWith('user-2');
  });
});

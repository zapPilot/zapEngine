import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  toCompositionTargetFromSuggestion,
  useStrategySuggestion,
} from '@/integration/useStrategySuggestion';

const mocks = vi.hoisted(() => ({
  createQueryConfig: vi.fn(() => ({ staleTime: 123 })),
  getDailySuggestion: vi.fn(),
  strategySuggestion: vi.fn((id: string) => ['strategy', id]),
  useQuery: vi.fn((options: unknown) => ({ options })),
}));

vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }));
vi.mock('@zapengine/app-core/hooks/queries', () => ({
  createQueryConfig: mocks.createQueryConfig,
  queryKeys: { desktop: { strategySuggestion: mocks.strategySuggestion } },
}));
vi.mock('@zapengine/app-core/services', () => ({
  getDailySuggestion: mocks.getDailySuggestion,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDailySuggestion.mockResolvedValue({ ok: true });
});

describe('strategy suggestion allocation', () => {
  it('combines crypto assets, defaults missing ratios, and avoids float noise', () => {
    expect(
      toCompositionTargetFromSuggestion({
        context: {
          target: {
            allocation: {
              spy: 0.123456789012,
              btc: 0.1,
              eth: 0.2,
              alt: undefined,
              stable: 0.576543210988,
            },
          },
        },
      } as never),
    ).toEqual({
      equities: 12.3456789012,
      crypto: 30,
      stables: 57.6543210988,
    });
  });
});

describe('useStrategySuggestion', () => {
  it('configures and executes the user-scoped query', async () => {
    const result = useStrategySuggestion('user-1') as unknown as {
      options: {
        enabled: boolean;
        queryKey: unknown;
        queryFn: () => Promise<unknown>;
        staleTime: number;
      };
    };

    expect(mocks.createQueryConfig).toHaveBeenCalledWith({
      dataType: 'volatile',
    });
    expect(result.options).toMatchObject({
      enabled: true,
      queryKey: ['strategy', 'user-1'],
      staleTime: 123,
    });
    await expect(result.options.queryFn()).resolves.toEqual({ ok: true });
    expect(mocks.getDailySuggestion).toHaveBeenCalledWith('user-1');
  });

  it('disables the no-user query and rejects if its query function is forced', () => {
    const result = useStrategySuggestion(null) as unknown as {
      options: {
        enabled: boolean;
        queryKey: unknown;
        queryFn: () => Promise<unknown>;
      };
    };

    expect(result.options).toMatchObject({
      enabled: false,
      queryKey: ['strategy', 'no-user'],
    });
    expect(() => result.options.queryFn()).toThrow('User ID is required');
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCreateStrategyConfig,
  useSetDefaultStrategyConfig,
  useUpdateStrategyConfig,
} from '@/hooks/mutations/useStrategyAdminMutations';
import {
  createStrategyConfig,
  setDefaultStrategyConfig,
  updateStrategyConfig,
} from '@/services';
import type {
  CreateStrategyConfigRequest,
  UpdateStrategyConfigRequest,
} from '@/types';

vi.mock('@/services', () => ({
  createStrategyConfig: vi.fn(),
  updateStrategyConfig: vi.fn(),
  setDefaultStrategyConfig: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

const mockCreateRequest: CreateStrategyConfigRequest = {
  config_id: 'test_config',
  display_name: 'Test Config',
  description: null,
  strategy_id: 'dma_gated_fgi',
  primary_asset: 'BTC',
  supports_daily_suggestion: true,
  params: { signal: { cross_cooldown_days: 30 } },
  composition: {
    kind: 'standard',
    bucket_mapper_id: 'default',
    signal: { component_id: 'signal_a', params: {} },
    decision_policy: { component_id: 'policy_a', params: {} },
    pacing_policy: { component_id: 'pacing_a', params: {} },
    execution_profile: { component_id: 'exec_a', params: {} },
    plugins: [],
  },
};

const mockUpdateBody: UpdateStrategyConfigRequest = {
  display_name: 'Updated Config',
  description: 'updated description',
  strategy_id: 'dma_gated_fgi',
  primary_asset: 'ETH',
  supports_daily_suggestion: false,
  params: { signal: { cross_cooldown_days: 21 } },
  composition: {
    kind: 'standard',
    bucket_mapper_id: 'default',
    signal: { component_id: 'signal_b', params: {} },
    decision_policy: { component_id: 'policy_b', params: {} },
    pacing_policy: { component_id: 'pacing_b', params: {} },
    execution_profile: { component_id: 'exec_b', params: {} },
    plugins: [],
  },
};

describe('useCreateStrategyConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createStrategyConfig with the correct request body', async () => {
    vi.mocked(createStrategyConfig).mockResolvedValue(undefined as any);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateStrategyConfig(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(mockCreateRequest);
    });

    expect(createStrategyConfig).toHaveBeenCalledOnce();
    expect(createStrategyConfig).toHaveBeenCalledWith(mockCreateRequest);
  });

  it('invalidates strategyAdmin queries on success', async () => {
    vi.mocked(createStrategyConfig).mockResolvedValue(undefined as any);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateStrategyConfig(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(mockCreateRequest);
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['strategyAdmin', 'configs'],
        }),
      );
    });
  });

  it('exposes isPending as false when not mutating', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateStrategyConfig(), { wrapper });

    expect(result.current.isPending).toBe(false);
  });

  it('propagates errors from createStrategyConfig', async () => {
    const error = new Error('create failed');
    vi.mocked(createStrategyConfig).mockRejectedValue(error);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateStrategyConfig(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync(mockCreateRequest),
      ).rejects.toThrow('create failed');
    });
  });
});

describe('useUpdateStrategyConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls updateStrategyConfig with configId and body', async () => {
    vi.mocked(updateStrategyConfig).mockResolvedValue(undefined as any);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateStrategyConfig(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        configId: 'test_config',
        body: mockUpdateBody,
      });
    });

    expect(updateStrategyConfig).toHaveBeenCalledOnce();
    expect(updateStrategyConfig).toHaveBeenCalledWith(
      'test_config',
      mockUpdateBody,
    );
  });

  it('invalidates strategyAdmin queries on success', async () => {
    vi.mocked(updateStrategyConfig).mockResolvedValue(undefined as any);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateStrategyConfig(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        configId: 'test_config',
        body: mockUpdateBody,
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['strategyAdmin', 'configs'],
        }),
      );
    });
  });

  it('exposes isPending as false when not mutating', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateStrategyConfig(), { wrapper });

    expect(result.current.isPending).toBe(false);
  });

  it('propagates errors from updateStrategyConfig', async () => {
    const error = new Error('update failed');
    vi.mocked(updateStrategyConfig).mockRejectedValue(error);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateStrategyConfig(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          configId: 'test_config',
          body: mockUpdateBody,
        }),
      ).rejects.toThrow('update failed');
    });
  });
});

describe('useSetDefaultStrategyConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls setDefaultStrategyConfig with the correct configId', async () => {
    vi.mocked(setDefaultStrategyConfig).mockResolvedValue(undefined as any);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSetDefaultStrategyConfig(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('my_config');
    });

    expect(setDefaultStrategyConfig).toHaveBeenCalledOnce();
    expect(setDefaultStrategyConfig).toHaveBeenCalledWith('my_config');
  });

  it('invalidates strategyAdmin queries on success', async () => {
    vi.mocked(setDefaultStrategyConfig).mockResolvedValue(undefined as any);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSetDefaultStrategyConfig(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('my_config');
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['strategyAdmin', 'configs'],
        }),
      );
    });
  });

  it('exposes isPending as false when not mutating', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSetDefaultStrategyConfig(), {
      wrapper,
    });

    expect(result.current.isPending).toBe(false);
  });

  it('propagates errors from setDefaultStrategyConfig', async () => {
    const error = new Error('set default failed');
    vi.mocked(setDefaultStrategyConfig).mockRejectedValue(error);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSetDefaultStrategyConfig(), {
      wrapper,
    });

    await act(async () => {
      await expect(result.current.mutateAsync('my_config')).rejects.toThrow(
        'set default failed',
      );
    });
  });
});

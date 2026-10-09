// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  QueryObserver,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { useReferenceStrategy } from '@/integration/useReferenceStrategy';
import {
  referenceConfigs,
  referenceResponse,
} from './support/referenceStrategyFixtures';
const api = vi.hoisted(() => ({ configs: vi.fn(), compare: vi.fn() }));
vi.mock('@zapengine/app-core/services/strategyService', () => ({
  getStrategyConfigs: api.configs,
}));
vi.mock('@zapengine/app-core/services/backtestingService', () => ({
  runBacktest: api.compare,
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it('shares one catalog and compare result across screen observers within the stale window', async () => {
  const observedOptions = vi.spyOn(QueryObserver.prototype, 'setOptions');
  api.configs.mockResolvedValue(referenceConfigs());
  api.compare.mockResolvedValue(referenceResponse());
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const host = document.createElement('div');
  const root = createRoot(host);
  const settled: ReturnType<typeof useReferenceStrategy>[] = [];
  function Probe() {
    const query = useReferenceStrategy();
    useLayoutEffect(() => {
      if (query.isSuccess) settled.push(query);
    }, [query]);
    return null;
  }
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
          <Probe />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(settled.at(-1)?.data?.stats).toEqual({
      rulesRoi: 5,
      dcaRoi: 1,
      maxDrawdown: -2,
    });
    expect(api.configs).toHaveBeenCalledOnce();
    expect(api.compare).toHaveBeenCalledOnce();
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
          <Probe />
          <Probe />
        </QueryClientProvider>,
      ),
    );
    expect(api.compare).toHaveBeenCalledOnce();
    expect(
      observedOptions.mock.calls.some(
        ([options]) => options.staleTime === 60 * 60 * 1000,
      ),
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
    observedOptions.mockRestore();
    client.clear();
    host.remove();
  }
});

// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';
import { useTodayDecision } from '@/integration/useTodayDecision';
import { referenceSuggestionFromBacktest } from '@/integration/referenceStrategyModel';
import { referenceResponse } from './support/referenceStrategyFixtures';
const m = vi.hoisted(() => ({
  reference: {
    data: { suggestion: null as DailySuggestionResponse | null },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  personal: {
    data: undefined as DailySuggestionResponse | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  personalQuery: vi.fn(),
}));
vi.mock('@/integration/useReferenceStrategy', () => ({
  useReferenceStrategy: () => m.reference,
}));
vi.mock('@/integration/useStrategySuggestion', () => ({
  useStrategySuggestion: (id: string | null) => {
    m.personalQuery(id);
    return m.personal;
  },
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let current: ReturnType<typeof useTodayDecision>;
function Probe({ input }: { input: Parameters<typeof useTodayDecision>[0] }) {
  const value = useTodayDecision(input);
  useLayoutEffect(() => {
    current = value;
  }, [value]);
  return null;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.reference.data.suggestion =
    referenceSuggestionFromBacktest(referenceResponse());
  m.personal.data = undefined;
  m.personal.isError = false;
  m.personal.isLoading = false;
  m.reference.isError = false;
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(input: Parameters<typeof useTodayDecision>[0]) {
  await act(async () => root.render(<Probe input={input} />));
}
it.each(['ios', 'web'])(
  'uses reference for %s read-only or guest sessions',
  async (platformOS) => {
    await render({
      platformOS,
      isConnected: platformOS === 'ios',
      netWorth: 100,
      userId: 'owner',
    });
    expect(current.source).toBe('reference');
    expect(current.suggestion).toBe(m.reference.data.suggestion);
    expect(current.packet?.asOf).toBe('2026-10-02');
    expect(m.personalQuery).toHaveBeenLastCalledWith(null);
    current.retry();
    expect(m.reference.refetch).toHaveBeenCalledOnce();
  },
);
it('uses personal decisions for funded connected wallets and forwards their failures', async () => {
  m.personal.data = { ...m.reference.data.suggestion!, as_of: 'personal-day' };
  await render({
    platformOS: 'web',
    isConnected: true,
    netWorth: 100,
    userId: 'owner',
  });
  expect(current.source).toBe('personal');
  expect(current.packet?.asOf).toBe('personal-day');
  expect(m.personalQuery).toHaveBeenLastCalledWith('owner');
  current.retry();
  expect(m.personal.refetch).toHaveBeenCalledOnce();
  m.personal.data = undefined;
  m.personal.isError = true;
  await render({
    platformOS: 'web',
    isConnected: true,
    netWorth: 100,
    userId: 'owner',
  });
  expect(current.suggestion).toBeNull();
  expect(current.packet).toBeNull();
  expect(current.isError).toBe(true);
});
it('keeps unfunded portfolios on reference and forwards reference failure without inventing data', async () => {
  m.reference.data.suggestion = null;
  m.reference.isError = true;
  await render({
    platformOS: 'android',
    isConnected: true,
    netWorth: 0,
    userId: 'owner',
  });
  expect(current.source).toBe('reference');
  expect(current.suggestion).toBeNull();
  expect(current.isError).toBe(true);
});

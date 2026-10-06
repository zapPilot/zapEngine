// @vitest-environment jsdom
import { act, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { renderHook } from './support/renderHook';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getId: vi.fn((): string | null => 'visited'),
}));
vi.mock('@/integration/bundleViewParam', () => ({
  getBundleViewUserId: mocks.getId,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.getId.mockReturnValue('visited');
});
describe('switchable bundle view store', () => {
  it('memoizes the URL snapshot and lets search and clear override the URL latch', async () => {
    const store = await import('../src/integration/bundleViewStore');
    const hook = renderHook(store.useBundleView);
    const first = hook.result.current;
    expect(first).toEqual({ userId: 'visited', matchedAddress: null });
    hook.rerender();
    expect(hook.result.current).toBe(first);
    act(() =>
      store.setBundleView({ userId: 'searched', matchedAddress: '0xabc' }),
    );
    expect(hook.result.current?.userId).toBe('searched');
    act(() => store.setBundleView(null));
    expect(hook.result.current).toBeNull();
  });
  it('supports a native/no-URL initial view and removes subscriptions', async () => {
    mocks.getId.mockReturnValue(null);
    const store = await import('../src/integration/bundleViewStore');
    const hook = renderHook(store.useBundleView);
    expect(hook.result.current).toBeNull();
    const listener = vi.fn();
    const unsubscribe = store.subscribeBundleView(listener);
    act(() => store.setBundleView({ userId: 'u', matchedAddress: null }));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    act(() => store.setBundleView(null));
    expect(listener).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
});

it('renders a stable empty view on the server', async () => {
  const store = await import('../src/integration/bundleViewStore');
  function Probe() {
    return createElement(
      'span',
      null,
      store.useBundleView()?.userId ?? 'empty',
    );
  }
  expect(renderToString(createElement(Probe))).toContain('empty');
});

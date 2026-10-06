// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { DesktopUpdateState } from '@zapengine/types/shared';
import { useDesktopUpdate } from '@/integration/desktopBridge.web';
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('@/integration/useAccount', () => ({ useAccount: () => ({}) }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it('subscribes, checks and forwards explicit actions, ignoring stale initial snapshots', async () => {
  let listener: (state: DesktopUpdateState) => void = () => {};
  let resolve: (state: DesktopUpdateState) => void = () => {};
  const off = vi.fn();
  const updates = {
    getState: vi.fn(
      () =>
        new Promise<DesktopUpdateState>((done) => {
          resolve = done;
        }),
    ),
    onStateChange: vi.fn((cb: typeof listener) => {
      listener = cb;
      return off;
    }),
    check: vi.fn(),
    download: vi.fn(),
    install: vi.fn(),
  };
  Object.assign(window, { zapDesktop: { updates } });
  let result: ReturnType<typeof useDesktopUpdate>;
  function Probe() {
    result = useDesktopUpdate();
    return null;
  }
  const host = document.createElement('div'),
    root = createRoot(host);
  await act(async () => root.render(createElement(Probe)));
  expect(updates.check).toHaveBeenCalledOnce();
  await act(async () => {
    listener({
      status: 'available',
      currentVersion: '0.2.0',
      version: '0.2.1',
    });
    resolve({ status: 'idle', currentVersion: '0.2.0' });
  });
  expect(result!.state?.status).toBe('available');
  result!.update();
  result!.install();
  result!.retry();
  expect(updates.download).toHaveBeenCalledOnce();
  expect(updates.install).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  expect(off).toHaveBeenCalledOnce();
  listener({ status: 'idle', currentVersion: '0.2.0' });
  delete (window as { zapDesktop?: unknown }).zapDesktop;
});
it('receives initial state, tolerates failed state reads and plain web', async () => {
  let result: ReturnType<typeof useDesktopUpdate>;
  function Probe() {
    result = useDesktopUpdate();
    return null;
  }
  const host = document.createElement('div'),
    root = createRoot(host);
  await act(async () => root.render(createElement(Probe)));
  expect(result!.state).toBeUndefined();
  result!.update();
  result!.install();
  result!.retry();
  await act(async () => root.unmount());
  for (const getState of [
    () => Promise.resolve({ status: 'idle' as const, currentVersion: '0.2.0' }),
    () => Promise.reject(new Error('IPC')),
  ]) {
    const updates = {
      getState,
      onStateChange: () => () => {},
      check: () => {},
      download: () => {},
      install: () => {},
    };
    Object.assign(window, { zapDesktop: { updates } });
    const mounted = createRoot(host);
    await act(async () => mounted.render(createElement(Probe)));
    await act(async () => mounted.unmount());
    delete (window as { zapDesktop?: unknown }).zapDesktop;
  }
});

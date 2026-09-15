// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnBundleUrlSync } from '@/integration/bundleShareUrlSync.web';

const mocks = vi.hoisted(() => ({
  account: { userId: null as string | null },
  getBundleViewUserId: vi.fn(() => null as string | null),
  pathname: '/home',
  resolve: vi.fn(() => null as string | null),
}));

vi.mock('expo-router', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/integration/useAccount', () => ({
  useAccount: () => mocks.account,
}));
vi.mock('@/integration/bundleViewParam', () => ({
  getBundleViewUserId: mocks.getBundleViewUserId,
}));
vi.mock('@/integration/bundleShareModel', () => ({
  resolveOwnBundleUrlSearch: mocks.resolve,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let nextFrame = 1;
const frames = new Map<number, FrameRequestCallback>();

async function render(): Promise<void> {
  if (!root) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => root?.render(createElement(OwnBundleUrlSync)));
}

async function flushFirstFrame(): Promise<void> {
  const entry = frames.entries().next().value as
    | [number, FrameRequestCallback]
    | undefined;
  if (!entry) throw new Error('No animation frame was scheduled');
  frames.delete(entry[0]);
  await act(async () => entry[1](0));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.account.userId = null;
  mocks.pathname = '/home';
  mocks.resolve.mockReturnValue(null);
  mocks.getBundleViewUserId.mockReturnValue(null);
  frames.clear();
  nextFrame = 1;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  window.history.replaceState({}, '', '/home#section');
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe('OwnBundleUrlSync web', () => {
  it('waits one frame before consulting or changing the router-owned URL', async () => {
    await render();
    expect(mocks.resolve).not.toHaveBeenCalled();

    await flushFirstFrame();
    expect(mocks.resolve).toHaveBeenCalledWith({
      pathname: '/home',
      search: '',
      latchedUrlUserId: null,
      ownUserId: null,
    });
  });

  it('adds and removes query strings without losing the hash', async () => {
    mocks.account.userId = 'user-1';
    mocks.resolve.mockReturnValue('tab=portfolio&userId=user-1');
    const replace = vi.spyOn(window.history, 'replaceState');
    await render();
    await flushFirstFrame();

    expect(replace).toHaveBeenLastCalledWith(
      window.history.state,
      '',
      '/home?tab=portfolio&userId=user-1#section',
    );

    mocks.pathname = '/portfolio';
    mocks.resolve.mockReturnValue('');
    window.history.replaceState({}, '', '/portfolio?userId=user-1#next');
    await render();
    expect(replace).toHaveBeenLastCalledWith(
      window.history.state,
      '',
      '/portfolio#next',
    );
  });

  it('does not write when the model reports an already-correct URL', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    await render();
    await flushFirstFrame();
    expect(replace).not.toHaveBeenCalled();
  });

  it('cancels the router handoff frame when unmounted early', async () => {
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame');
    await render();
    const id = frames.keys().next().value as number;

    await act(async () => root?.unmount());
    root = null;

    expect(cancel).toHaveBeenCalledWith(id);
    expect(frames.size).toBe(0);
  });
});

// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useTelegramConnection,
  type UseTelegramConnection,
} from '@/integration/useTelegramConnection';

const mocks = vi.hoisted(() => ({
  createModel: vi.fn(),
  extractErrorMessage: vi.fn(),
  getTelegramStatus: vi.fn(),
  requestTelegramToken: vi.fn(),
  disconnectTelegram: vi.fn(),
}));

vi.mock('@zapengine/app-core/lib/errors', () => ({
  extractErrorMessage: mocks.extractErrorMessage,
}));
vi.mock('@zapengine/app-core/services', () => ({
  getTelegramStatus: mocks.getTelegramStatus,
  requestTelegramToken: mocks.requestTelegramToken,
  disconnectTelegram: mocks.disconnectTelegram,
}));
vi.mock('@/integration/telegramConnectionModel', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/integration/telegramConnectionModel')
    >();
  return { ...actual, createTelegramConnectionModel: mocks.createModel };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const snapshot = { view: { kind: 'loading' } as const, isDisconnecting: false };
const model = {
  subscribe: vi.fn(() => () => undefined),
  getSnapshot: vi.fn(() => snapshot),
  getView: vi.fn(() => ({ kind: 'idle' })),
  load: vi.fn(),
  poll: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  retry: vi.fn(),
};

interface Harness {
  current(): UseTelegramConnection;
  root: Root;
  container: HTMLDivElement;
}

let active: Harness | null = null;

function Probe({
  userId,
  openLink,
  onValue,
}: {
  userId: string | null;
  openLink: (url: string) => void;
  onValue: (value: UseTelegramConnection) => void;
}): ReactElement | null {
  onValue(useTelegramConnection({ userId, openLink }));
  return null;
}

async function render(userId: string | null): Promise<Harness> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let value: UseTelegramConnection | null = null;
  await act(async () => {
    root.render(
      createElement(Probe, {
        userId,
        openLink: vi.fn(),
        onValue: (next) => (value = next),
      }),
    );
    await Promise.resolve();
  });
  active = {
    root,
    container,
    current: () => {
      if (!value) throw new Error('Telegram hook did not render');
      return value;
    },
  };
  return active;
}

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.createModel.mockReturnValue(model);
  model.getSnapshot.mockReturnValue(snapshot);
  model.getView.mockReturnValue({ kind: 'idle' });
  model.load.mockResolvedValue(undefined);
  model.poll.mockResolvedValue('pending');
  model.connect.mockResolvedValue(undefined);
  model.disconnect.mockResolvedValue(undefined);
  model.retry.mockResolvedValue(undefined);
  active = null;
});

afterEach(async () => {
  if (active) {
    await act(async () => active?.root.unmount());
    active.container.remove();
    active = null;
  }
  vi.useRealTimers();
});

describe('useTelegramConnection', () => {
  it('stays disabled and keeps all actions inert without a user', async () => {
    const harness = await render(null);
    expect(harness.current()).toMatchObject({
      enabled: false,
      view: { kind: 'loading' },
      isDisconnecting: false,
    });

    harness.current().connect();
    harness.current().disconnect();
    harness.current().retry();
    await flushPromises();

    expect(mocks.createModel).not.toHaveBeenCalled();
    expect(model.connect).not.toHaveBeenCalled();
    expect(model.disconnect).not.toHaveBeenCalled();
    expect(model.retry).not.toHaveBeenCalled();
  });

  it('creates the orchestration model with app-core services and loads it', async () => {
    const harness = await render('user-1');

    expect(harness.current().enabled).toBe(true);
    expect(mocks.createModel).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        getStatus: mocks.getTelegramStatus,
        requestToken: mocks.requestTelegramToken,
        disconnect: mocks.disconnectTelegram,
        toErrorMessage: mocks.extractErrorMessage,
      }),
    );
    expect(model.load).toHaveBeenCalledOnce();
    const dependencies = mocks.createModel.mock.calls[0]?.[1] as {
      now: () => number;
    };
    expect(dependencies.now()).toBe(Date.now());
  });

  it('polls a connecting flow until the model returns a terminal outcome', async () => {
    model.getView.mockReturnValue({ kind: 'connecting' });
    model.poll
      .mockResolvedValueOnce('pending')
      .mockResolvedValueOnce('connected');
    const harness = await render('user-1');

    harness.current().connect();
    await flushPromises();
    expect(model.connect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(model.poll).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(model.poll).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not poll when connect settles outside the connecting view', async () => {
    const harness = await render('user-1');
    harness.current().connect();
    await flushPromises();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces intervals, delegates disconnect, and stops polling on retry', async () => {
    model.getView.mockReturnValue({ kind: 'connecting' });
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const harness = await render('user-1');

    harness.current().connect();
    await flushPromises();
    harness.current().connect();
    await flushPromises();
    expect(clear).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    harness.current().disconnect();
    harness.current().retry();
    await flushPromises();
    expect(model.disconnect).toHaveBeenCalledOnce();
    expect(model.retry).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans an active polling interval up on unmount', async () => {
    model.getView.mockReturnValue({ kind: 'connecting' });
    const harness = await render('user-1');
    harness.current().connect();
    await flushPromises();
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => harness.root.unmount());
    harness.container.remove();
    active = null;
    expect(vi.getTimerCount()).toBe(0);
  });
});

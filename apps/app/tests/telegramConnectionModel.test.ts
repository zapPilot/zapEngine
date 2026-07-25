import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createTelegramConnectionModel,
  TELEGRAM_MAX_POLL_DURATION_MS,
  type TelegramConnectionDeps,
} from '../src/integration/telegramConnectionModel';

const CONNECTED = {
  isConnected: true,
  isEnabled: true,
  connectedAt: '2026-01-01T00:00:00.000Z',
};
const DISCONNECTED = {
  isConnected: false,
  isEnabled: false,
  connectedAt: null,
};

function setup(overrides: Partial<TelegramConnectionDeps> = {}) {
  let clock = 0;
  const deps: TelegramConnectionDeps = {
    getStatus: vi.fn().mockResolvedValue(DISCONNECTED),
    requestToken: vi.fn().mockResolvedValue({ deepLink: 'https://t.me/bot' }),
    disconnect: vi.fn().mockResolvedValue({ success: true }),
    openLink: vi.fn(),
    now: () => clock,
    toErrorMessage: (_error, fallback) => fallback,
    ...overrides,
  };
  const model = createTelegramConnectionModel('user-1', deps);
  return { model, deps, advance: (ms: number) => (clock += ms) };
}

describe('telegram connection model', () => {
  beforeEach(() => vi.clearAllMocks());

  it('load settles to an idle view and notifies subscribers', async () => {
    const { model } = setup({
      getStatus: vi.fn().mockResolvedValue(CONNECTED),
    });
    const listener = vi.fn();
    model.subscribe(listener);
    await model.load();
    expect(model.getView()).toEqual({ kind: 'idle', status: CONNECTED });
    expect(model.getSnapshot()).toEqual({
      view: { kind: 'idle', status: CONNECTED },
      isDisconnecting: false,
    });
    expect(listener).toHaveBeenCalled();
  });

  it('unsubscribe stops further notifications', async () => {
    const { model } = setup();
    const listener = vi.fn();
    const unsubscribe = model.subscribe(listener);
    unsubscribe();
    await model.load();
    expect(listener).not.toHaveBeenCalled();
  });

  it('load shows an error view when the status fetch fails', async () => {
    const { model } = setup({
      getStatus: vi.fn().mockRejectedValue(new Error('boom')),
    });
    await model.load();
    expect(model.getView()).toMatchObject({ kind: 'error' });
  });

  it('connect opens the deep link and enters the connecting state', async () => {
    const { model, deps } = setup();
    await model.connect();
    expect(deps.requestToken).toHaveBeenCalledWith('user-1');
    expect(deps.openLink).toHaveBeenCalledWith('https://t.me/bot');
    expect(model.getView()).toEqual({
      kind: 'connecting',
      deepLink: 'https://t.me/bot',
    });
  });

  it('connect surfaces a mapped error when token generation fails', async () => {
    const { model } = setup({
      requestToken: vi.fn().mockRejectedValue(new Error('nope')),
      toErrorMessage: () => 'mapped message',
    });
    await model.connect();
    expect(model.getView()).toEqual({
      kind: 'error',
      message: 'mapped message',
    });
  });

  it('poll stays pending until the status flips to connected', async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce(DISCONNECTED)
      .mockResolvedValueOnce(CONNECTED);
    const { model } = setup({ getStatus });
    await model.connect();

    expect(await model.poll()).toBe('pending');
    expect(await model.poll()).toBe('connected');
    expect(model.getView()).toEqual({ kind: 'idle', status: CONNECTED });
  });

  it('poll keeps polling through transient status errors', async () => {
    const getStatus = vi.fn().mockRejectedValue(new Error('flaky'));
    const { model } = setup({ getStatus });
    await model.connect();
    expect(await model.poll()).toBe('pending');
  });

  it('poll times out after the max duration elapses', async () => {
    const { model, advance } = setup();
    await model.connect();
    advance(TELEGRAM_MAX_POLL_DURATION_MS + 1);
    expect(await model.poll()).toBe('timed-out');
    expect(model.getView()).toMatchObject({ kind: 'error' });
  });

  it('disconnect toggles the flag and refetches status', async () => {
    const getStatus = vi.fn().mockResolvedValue(DISCONNECTED);
    const { model, deps } = setup({ getStatus });
    await model.disconnect();
    expect(deps.disconnect).toHaveBeenCalledWith('user-1');
    expect(model.isDisconnecting()).toBe(false);
    expect(model.getView()).toEqual({ kind: 'idle', status: DISCONNECTED });
  });

  it('disconnect surfaces a mapped error on failure', async () => {
    const { model } = setup({
      disconnect: vi.fn().mockRejectedValue(new Error('fail')),
      toErrorMessage: () => 'disconnect failed',
    });
    await model.disconnect();
    expect(model.getView()).toEqual({
      kind: 'error',
      message: 'disconnect failed',
    });
    expect(model.isDisconnecting()).toBe(false);
  });

  it('retry resets to loading then refetches', async () => {
    const { model } = setup({
      getStatus: vi.fn().mockResolvedValue(CONNECTED),
    });
    await model.retry();
    expect(model.getView()).toEqual({ kind: 'idle', status: CONNECTED });
  });
});

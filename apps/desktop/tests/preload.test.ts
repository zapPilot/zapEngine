import { expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  expose: vi.fn(),
  on: vi.fn(),
  remove: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock('@sentry/electron/preload', () => ({}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mock.expose },
  ipcRenderer: {
    on: mock.on,
    removeListener: mock.remove,
    send: mock.send,
    invoke: mock.invoke,
  },
}));
import '../src/preload/preload';

import { IPC_CHANNELS } from '../src/shared/ipc';
it('exposes only fixed desktop methods and subscribes with cleanup', () => {
  expect(mock.expose).toHaveBeenCalledOnce();
  const [name, bridge] = mock.expose.mock.calls[0]!;
  expect(name).toBe('zapDesktop');
  expect(Object.keys(bridge).sort()).toEqual(
    [
      'platform',
      'onRebalanceProposal',
      'onDeepLink',
      'updates',
      'registerSchedulerContext',
      'clearSchedulerContext',
      'openExternal',
    ].sort(),
  );
  expect(Object.keys(bridge.updates).sort()).toEqual(
    ['getState', 'check', 'download', 'install', 'onStateChange'].sort(),
  );
  bridge.updates.getState();
  expect(mock.invoke).toHaveBeenCalledWith(IPC_CHANNELS.updateGetState);
  bridge.updates.check();
  bridge.updates.download();
  bridge.updates.install();
  bridge.registerSchedulerContext({ userId: 'u', walletAddress: 'a' });
  bridge.clearSchedulerContext();
  bridge.openExternal('https://example.com');
  expect(mock.send.mock.calls.map((call) => call[0])).toEqual([
    IPC_CHANNELS.updateCheck,
    IPC_CHANNELS.updateDownload,
    IPC_CHANNELS.updateInstall,
    IPC_CHANNELS.registerSchedulerContext,
    IPC_CHANNELS.clearSchedulerContext,
    IPC_CHANNELS.openExternal,
  ]);
  for (const method of [
    bridge.onDeepLink,
    bridge.onRebalanceProposal,
    bridge.updates.onStateChange,
  ]) {
    const cb = vi.fn();
    const off = method(cb);
    const [channel, listener] = mock.on.mock.calls.at(-1)!;
    listener({}, 'payload');
    expect(cb).toHaveBeenCalledWith('payload');
    off();
    expect(mock.remove).toHaveBeenCalledWith(channel, listener);
  }
});

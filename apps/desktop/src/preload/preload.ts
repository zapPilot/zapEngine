import '@sentry/electron/preload';

import type { DesktopUpdateState } from '@zapengine/types/shared';
import { contextBridge, ipcRenderer } from 'electron';

import {
  IPC_CHANNELS,
  type RebalanceProposal,
  type SchedulerContext,
} from '../shared/ipc';

function subscribe<T>(
  channel: string,
  callback: (value: T) => void,
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T) =>
    callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

/**
 * Minimal typed bridge exposed to the renderer as `window.zapDesktop`.
 * The app web bundle detects it to switch APP_RUNTIME to 'desktop'
 * (see apps/app/src/config/appRuntime.web.ts).
 */
const zapDesktop = {
  platform: 'electron' as const,
  onRebalanceProposal: (callback: (proposal: RebalanceProposal) => void) =>
    subscribe(IPC_CHANNELS.rebalanceProposal, callback),
  onDeepLink: (callback: (url: string) => void) =>
    subscribe(IPC_CHANNELS.deepLink, callback),
  updates: {
    getState: (): Promise<DesktopUpdateState> =>
      ipcRenderer.invoke(IPC_CHANNELS.updateGetState),
    check: () => ipcRenderer.send(IPC_CHANNELS.updateCheck),
    download: () => ipcRenderer.send(IPC_CHANNELS.updateDownload),
    install: () => ipcRenderer.send(IPC_CHANNELS.updateInstall),
    onStateChange: (callback: (state: DesktopUpdateState) => void) =>
      subscribe(IPC_CHANNELS.updateState, callback),
  },

  registerSchedulerContext(context: SchedulerContext): void {
    ipcRenderer.send(IPC_CHANNELS.registerSchedulerContext, context);
  },

  clearSchedulerContext(): void {
    ipcRenderer.send(IPC_CHANNELS.clearSchedulerContext);
  },

  openExternal(url: string): void {
    ipcRenderer.send(IPC_CHANNELS.openExternal, url);
  },
};

contextBridge.exposeInMainWorld('zapDesktop', zapDesktop);

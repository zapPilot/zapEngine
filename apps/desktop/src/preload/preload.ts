import { contextBridge, ipcRenderer } from 'electron';

import {
  IPC_CHANNELS,
  type RebalanceProposal,
  type SchedulerContext,
} from '../shared/ipc';

/**
 * Minimal typed bridge exposed to the renderer as `window.zapDesktop`.
 * The app web bundle detects it to switch APP_RUNTIME to 'desktop'
 * (see apps/app/src/config/appRuntime.web.ts).
 */
const zapDesktop = {
  platform: 'electron' as const,

  onRebalanceProposal(
    callback: (proposal: RebalanceProposal) => void,
  ): () => void {
    const listener = (
      _event: Electron.IpcRendererEvent,
      proposal: RebalanceProposal,
    ) => callback(proposal);
    ipcRenderer.on(IPC_CHANNELS.rebalanceProposal, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.rebalanceProposal, listener);
    };
  },

  onDeepLink(callback: (url: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, url: string) =>
      callback(url);
    ipcRenderer.on(IPC_CHANNELS.deepLink, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.deepLink, listener);
    };
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

export type ZapDesktopBridge = typeof zapDesktop;

contextBridge.exposeInMainWorld('zapDesktop', zapDesktop);

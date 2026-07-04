import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, Notification } from 'electron';

import {
  IPC_CHANNELS,
  isSchedulerContext,
  type RebalanceProposal,
} from '../shared/ipc';
import { registerAppProtocolHandler, registerAppScheme } from './appProtocol';
import { configureMainAppCoreEnv } from './config';
import { extractDeepLink, registerDeepLinkScheme } from './deepLinks';
import { openExternalUrl } from './externalAuth';
import { startLoopbackServer } from './loopbackServer';
import {
  clampIntervalMs,
  createRebalanceScheduler,
} from './scheduler/rebalanceScheduler';
import { createSuggestionDriftReader } from './scheduler/suggestionDriftReader';
import { createTray } from './tray';
import { createMainWindow } from './window';

let mainWindow: BrowserWindow | undefined;
let isQuitting = false;
let pendingDeepLink: string | undefined;

function resolveWebRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'web');
  }
  return (
    process.env['ZAP_ELECTRON_WEB_ROOT'] ??
    join(app.getAppPath(), '..', 'mobile-v2', 'dist', 'web')
  );
}

function showMainWindow(): void {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function dispatchDeepLink(url: string): void {
  if (!mainWindow) {
    pendingDeepLink = url;
    return;
  }
  showMainWindow();
  mainWindow.webContents.send(IPC_CHANNELS.deepLink, url);
}

function notifyRebalanceProposal(proposal: RebalanceProposal): void {
  const notification = new Notification({
    title: 'Zap Pilot — rebalance suggested',
    body: `Portfolio drift ${proposal.driftPercent.toFixed(1)}% — review and confirm in the app. Nothing is signed automatically.`,
  });
  notification.on('click', () => {
    showMainWindow();
    mainWindow?.webContents.send(IPC_CHANNELS.rebalanceProposal, proposal);
  });
  notification.show();
}

// Inject app-core env before any service module is used (esbuild bundles
// app-core into this file; there is no runtime workspace resolution).
configureMainAppCoreEnv();

const rebalanceScheduler = createRebalanceScheduler({
  readDrift: createSuggestionDriftReader({ log: console.warn }),
  notify: notifyRebalanceProposal,
  intervalMs: clampIntervalMs(process.env['ZAP_REBALANCE_CHECK_INTERVAL_MS']),
  driftThresholdPercent: Number(
    process.env['ZAP_REBALANCE_DRIFT_THRESHOLD'] ?? '',
  ) || undefined,
  log: console.warn,
});

// --- single instance -------------------------------------------------------
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const link = extractDeepLink(argv);
    if (link) {
      dispatchDeepLink(link);
      return;
    }
    showMainWindow();
  });

  // macOS cold-start / running-instance deep links.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    dispatchDeepLink(url);
  });

  // Must happen before ready.
  registerAppScheme();
  registerDeepLinkScheme();

  void app.whenReady().then(async () => {
    const webRoot = resolveWebRoot();
    registerAppProtocolHandler(webRoot);

    // Renderer source priority: explicit dev URL (expo dev server) >
    // loopback http fallback (Privy origin spike path (b)) > app:// bundle.
    let url = process.env['ZAP_ELECTRON_DEV_URL'];
    if (!url && process.env['ZAP_ELECTRON_LOOPBACK'] === '1') {
      const port = Number(process.env['ZAP_ELECTRON_LOOPBACK_PORT'] ?? '3105');
      ({ url } = await startLoopbackServer(webRoot, port));
    }

    mainWindow = createMainWindow({ url });

    // Close-to-tray: the app keeps running for the background scheduler.
    mainWindow.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault();
        mainWindow?.hide();
      }
    });
    mainWindow.on('closed', () => {
      mainWindow = undefined;
    });

    createTray({
      onShow: showMainWindow,
      onQuit: () => {
        isQuitting = true;
        app.quit();
      },
    });

    const coldStartLink = pendingDeepLink ?? extractDeepLink(process.argv);
    if (coldStartLink) {
      pendingDeepLink = undefined;
      mainWindow.webContents.once('did-finish-load', () => {
        dispatchDeepLink(coldStartLink);
      });
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    rebalanceScheduler.stop();
  });

  // Tray-resident: do not exit when the window closes.
  app.on('window-all-closed', () => {
    if (isQuitting) {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (mainWindow) {
      showMainWindow();
    }
  });

  // --- IPC ------------------------------------------------------------------
  ipcMain.on(IPC_CHANNELS.openExternal, (_event, url: unknown) => {
    void openExternalUrl(url);
  });

  // The renderer pushes {userId, walletAddress} after Privy login; the main
  // process never holds Privy credentials.
  ipcMain.on(
    IPC_CHANNELS.registerSchedulerContext,
    (_event, context: unknown) => {
      if (!isSchedulerContext(context)) {
        return;
      }
      rebalanceScheduler.setContext(context);
    },
  );

  ipcMain.on(IPC_CHANNELS.clearSchedulerContext, () => {
    rebalanceScheduler.setContext(undefined);
  });
}

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  app,
  autoUpdater as nativeUpdater,
  BrowserWindow,
  ipcMain,
  Notification,
} from 'electron';

import {
  IPC_CHANNELS,
  isSchedulerContext,
  type RebalanceProposal,
} from '../shared/ipc';
import { registerAppProtocolHandler, registerAppScheme } from './appProtocol';
import { configureMainAppCoreEnv } from './config';
import { extractDeepLink, registerDeepLinkScheme } from './deepLinks';
import { openExternalUrl } from './externalAuth';
import { resolveRendererUrl } from './rendererUrl';
import {
  clampIntervalMs,
  createRebalanceScheduler,
} from './scheduler/rebalanceScheduler';
import { createSuggestionDriftReader } from './scheduler/suggestionDriftReader';
import { captureDesktopException, flushSentry } from './sentry';
import { createTray } from './tray';
import { createDesktopUpdater, isUpdateSupported } from './updater';
import { createMainWindow } from './window';

let mainWindow: BrowserWindow | undefined;
let isQuitting = false;
let installingUpdate = false;
let updater: ReturnType<typeof createDesktopUpdater> | undefined;
let pendingDeepLink: string | undefined;
let sentryFlushed = false;

function resolveWebRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'web');
  }
  return (
    process.env['ZAP_ELECTRON_WEB_ROOT'] ??
    join(app.getAppPath(), '..', 'app', 'dist', 'web')
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

function showAndSend(channel: string, payload: unknown): void {
  showMainWindow();
  mainWindow?.webContents.send(channel, payload);
}

function dispatchDeepLink(url: string): void {
  if (!mainWindow) {
    pendingDeepLink = url;
    return;
  }
  showAndSend(IPC_CHANNELS.deepLink, url);
}

function notifyRebalanceProposal(proposal: RebalanceProposal): void {
  const notification = new Notification({
    title: 'Zap Pilot — rebalance suggested',
    body: `Portfolio drift ${proposal.driftPercent.toFixed(1)}% — review and confirm in the app. Nothing is signed automatically.`,
  });
  notification.on('click', () => {
    showAndSend(IPC_CHANNELS.rebalanceProposal, proposal);
  });
  notification.show();
}

function parseDriftThresholdPercent(
  value: string | undefined,
): number | undefined {
  return Number(value ?? '') || undefined;
}

async function initializeApp(): Promise<void> {
  await app.whenReady();

  const webRoot = resolveWebRoot();
  registerAppProtocolHandler(webRoot);

  const url = await resolveRendererUrl(webRoot, app.isPackaged, process.env);

  const window = createMainWindow(url);
  mainWindow = window;

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('closed', () => {
    mainWindow = undefined;
  });

  const reason = isUpdateSupported({
    isPackaged: app.isPackaged,
    platform: process.platform,
    hasUpdateConfig: existsSync(join(process.resourcesPath, 'app-update.yml')),
    inApplicationsFolder:
      process.platform === 'darwin' && app.isInApplicationsFolder(),
  });
  const engine = reason
    ? undefined
    : (await import('electron-updater')).autoUpdater;
  const tray = createTray({
    download: () => {
      void updater?.download();
    },
    install: () => updater?.install(),
    onShow: showMainWindow,
    onQuit: () => {
      isQuitting = true;
      app.quit();
    },
  });

  updater = createDesktopUpdater({
    engine,
    currentVersion: app.getVersion(),
    reason,
    publish: (state) => {
      if (state.status === 'error') {
        installingUpdate = false;
        isQuitting = false;
      }
      mainWindow?.webContents.send(IPC_CHANNELS.updateState, state);
      tray.setUpdateState(state);
    },
    onError: (error) => {
      installingUpdate = false;
      isQuitting = false;
      captureDesktopException(error, { component: 'updater', level: 'error' });
    },
  });
  tray.setUpdateState(updater.getState());
  updater.start();
  nativeUpdater.on('before-quit-for-update', () => {
    installingUpdate = true;
    isQuitting = true;
  });
  ipcMain.handle(IPC_CHANNELS.updateGetState, (event) => {
    if (event.sender !== mainWindow?.webContents)
      throw new Error('Invalid update sender');
    return updater?.getState();
  });
  for (const [channel, action] of [
    [IPC_CHANNELS.updateCheck, () => updater?.check()],
    [IPC_CHANNELS.updateDownload, () => updater?.download()],
    [IPC_CHANNELS.updateInstall, () => updater?.install()],
  ] as const)
    ipcMain.on(channel, (event) => {
      if (event.sender === mainWindow?.webContents) void action();
    });

  const coldStartLink = pendingDeepLink ?? extractDeepLink(process.argv);
  if (coldStartLink) {
    pendingDeepLink = undefined;
    window.webContents.once('did-finish-load', () => {
      dispatchDeepLink(coldStartLink);
    });
  }
}

async function initializeAppSafely(): Promise<void> {
  try {
    await initializeApp();
  } catch (error) {
    captureDesktopException(error, { component: 'bootstrap', level: 'error' });
  }
}

async function quitAfterSentryFlush(): Promise<void> {
  await flushSentry();
  app.quit();
}

function bootstrap(): void {
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

  void initializeAppSafely();

  app.on('before-quit', (event) => {
    if (installingUpdate || sentryFlushed) {
      return;
    }
    isQuitting = true;
    rebalanceScheduler.stop();
    event.preventDefault();
    sentryFlushed = true;
    void quitAfterSentryFlush();
  });

  // Tray-resident: do not exit when the window closes.
  app.on('window-all-closed', () => {
    if (isQuitting && !installingUpdate) {
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

// Inject app-core env before any service module is used (esbuild bundles
// app-core into this file; there is no runtime workspace resolution).
configureMainAppCoreEnv();

const rebalanceScheduler = createRebalanceScheduler({
  readDrift: createSuggestionDriftReader({ log: console.warn }),
  notify: notifyRebalanceProposal,
  intervalMs: clampIntervalMs(process.env['ZAP_REBALANCE_CHECK_INTERVAL_MS']),
  driftThresholdPercent: parseDriftThresholdPercent(
    process.env['ZAP_REBALANCE_DRIFT_THRESHOLD'],
  ),
  log: console.warn,
});

// --- single instance -------------------------------------------------------
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  bootstrap();
}

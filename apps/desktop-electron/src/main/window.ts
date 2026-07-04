import { join } from 'node:path';

import { BrowserWindow } from 'electron';

import { APP_START_URL } from './appProtocol';
import { openExternalUrl } from './externalAuth';

export type WindowLoadTarget = {
  /** http URL (expo dev server or loopback fallback); app:// when absent. */
  url?: string;
};

export function createMainWindow(target: WindowLoadTarget): BrowserWindow {
  const win = new BrowserWindow({
    width: 430,
    height: 900,
    minWidth: 360,
    minHeight: 640,
    title: 'Zap Pilot',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/preload.cjs'),
    },
  });

  // Any window.open / target=_blank leaves the shell: https opens in the
  // system browser (OAuth round-trips come back via the deep link).
  win.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: 'deny' };
  });

  // In-place navigation must stay on the bundled origin.
  win.webContents.on('will-navigate', (event, url) => {
    const stays =
      url.startsWith(APP_START_URL) ||
      (target.url !== undefined && url.startsWith(target.url));
    if (!stays) {
      event.preventDefault();
      void openExternalUrl(url);
    }
  });

  void win.loadURL(target.url ?? APP_START_URL);
  return win;
}

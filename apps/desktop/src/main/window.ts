import { join } from 'node:path';

import { tokens } from '@zapengine/design-tokens/tokens';
import { BrowserWindow } from 'electron';

import { APP_START_URL } from './appProtocol';
import { openExternalUrl } from './externalAuth';

/** Uses an http URL for an expo dev server or loopback fallback when given. */
export function createMainWindow(url?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 390,
    minHeight: 640,
    title: 'Zap Pilot',
    backgroundColor: tokens.color.bg,
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
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const stays =
      navigationUrl.startsWith(APP_START_URL) ||
      (url !== undefined && navigationUrl.startsWith(url));
    if (!stays) {
      event.preventDefault();
      void openExternalUrl(navigationUrl);
    }
  });

  void win.loadURL(url ?? APP_START_URL);
  return win;
}

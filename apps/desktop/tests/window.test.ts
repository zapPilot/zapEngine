import { tokens } from '@zapengine/design-tokens/tokens';
import { BrowserWindow } from 'electron';
import { expect, it, vi } from 'vitest';

import { createMainWindow } from '../src/main/window';
const win = vi.hoisted(() => ({
  webContents: { setWindowOpenHandler: vi.fn(), on: vi.fn() },
  loadURL: vi.fn(),
}));
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function () {
    return win;
  }),
}));
vi.mock('../src/main/externalAuth', () => ({ openExternalUrl: vi.fn() }));
vi.mock('../src/main/appProtocol', () => ({ APP_START_URL: 'app://bundle/' }));
it('opens a desktop-sized dark window while retaining a compact minimum and isolation', () => {
  createMainWindow('http://127.0.0.1:3118');
  expect(vi.mocked(BrowserWindow).mock.calls[0]?.[0]).toMatchObject({
    width: 1280,
    height: 832,
    minWidth: 390,
    backgroundColor: tokens.color.bg,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:3118');
});

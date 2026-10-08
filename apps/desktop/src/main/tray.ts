import type { DesktopUpdateState } from '@zapengine/types/shared';
import { Menu, nativeImage, Tray } from 'electron';

import { TRAY_ICON_DATA_URL } from './tray-icon';
import { updateTrayItem } from './trayMenu';

export interface TrayHandlers {
  onShow: () => void;
  onQuit: () => void;
  download: () => void;
  install: () => void;
}

export function createTray(handlers: TrayHandlers): {
  setUpdateState: (state: DesktopUpdateState) => void;
} {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip('Zap Pilot');
  const setUpdateState = (state: DesktopUpdateState) =>
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Zap Pilot', click: handlers.onShow },
        ...updateTrayItem(state, handlers),
        { type: 'separator' },
        { label: 'Quit', click: handlers.onQuit },
      ]),
    );
  setUpdateState({ status: 'idle', currentVersion: '' });
  tray.on('click', handlers.onShow);
  return { setUpdateState };
}

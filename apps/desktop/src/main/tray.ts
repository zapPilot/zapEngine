import { Menu, nativeImage, Tray } from 'electron';

// 16x16 monochrome placeholder glyph (generated); swap for a branded
// template image when design assets land.
const TRAY_ICON_DATA_URL =
  // eslint-disable-next-line no-secrets/no-secrets -- Placeholder PNG data URL, not a secret.
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAaElEQVR4nKWTQQ4AIQgDi///s3sjUFgC0hvQMRUjsJQUs9vxZk0GS+YM4eA5f4NAXTfWQrImmZ1EFBGboBPdwsqILVg2CcHa5iVOYADxFUYwMFwiHeaW+CzO13oNy3GC+sKJZ/2Z1voAj8kfEtas2JEAAAAASUVORK5CYII=';

export interface TrayHandlers {
  onShow: () => void;
  onQuit: () => void;
}

export function createTray(handlers: TrayHandlers): Tray {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip('Zap Pilot');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Zap Pilot', click: handlers.onShow },
      { type: 'separator' },
      { label: 'Quit', click: handlers.onQuit },
    ]),
  );
  tray.on('click', handlers.onShow);
  return tray;
}

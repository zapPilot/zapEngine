import { Menu, nativeImage, Tray } from 'electron';

// 16x16 monochrome Zap Pilot "1c" dial glyph, rendered as a macOS template
// image (black on transparent; the menu bar re-tints it for light/dark).
const TRAY_ICON_DATA_URL =
  // eslint-disable-next-line no-secrets/no-secrets -- Branded PNG data URL, not a secret.
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABHElEQVR4nKXPMUrDUADG8e/hLKSOuqQHEFpcBZPZQcQDmJ7AuLqY4AHMDRpHx06OzQ0sOAlCgxdoNkf9P56BNH1IsX/4PQolX/KM/F0jlBTJVUmqJT1hLYNuiaR7DLBALVcoaYQVcpT6zaAtkTRFjgINup0ixRUmKEUGtlDSEhOU8veJE5xjiiFqw2Gbw/6O5O8Oe3iArZK7zqV9KJR7e4xKmx3gDUdoi+ReOjQc9l6ZpAC+SkkveEa3BqkdyOQWI232jkPso18ltAMXGKPfB75wjH6vmNmBSO4+A9jP2qYAK8R2wPaNWxTYphSPMO1AJukGMRb4qxHmyFEYjrZS0hnGaOArwBIzJKLugP0zk9PAV4BMToO1gX+188APFQg40QGWaOEAAAAASUVORK5CYII=';

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

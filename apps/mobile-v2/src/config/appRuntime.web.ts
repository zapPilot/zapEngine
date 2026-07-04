/**
 * Web runtime flavor: 'desktop' when running inside the Electron shell
 * (apps/desktop-electron exposes window.zapDesktop via its preload bridge),
 * plain 'web' otherwise.
 */
export const APP_RUNTIME =
  typeof window !== 'undefined' && 'zapDesktop' in window ? 'desktop' : 'web';

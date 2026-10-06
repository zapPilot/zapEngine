import type { DesktopUpdateState } from '@zapengine/types/shared';
export interface UpdateEngine {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  on(event: string, callback: (...args: any[]) => void): unknown;
  removeListener(event: string, callback: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}
export function isUpdateSupported(input: {
  isPackaged: boolean;
  platform: string;
  hasUpdateConfig: boolean;
  inApplicationsFolder: boolean;
}): 'dev' | 'location' | undefined {
  if (
    !input.isPackaged ||
    input.platform !== 'darwin' ||
    !input.hasUpdateConfig
  )
    return 'dev';
  if (!input.inApplicationsFolder) return 'location';
  return undefined;
}
export function createDesktopUpdater({
  engine,
  currentVersion,
  publish,
  onError,
  reason = 'dev',
  now = Date.now,
  timers = { setTimeout, clearTimeout, setInterval, clearInterval },
}: {
  engine?: UpdateEngine;
  currentVersion: string;
  publish: (state: DesktopUpdateState) => void;
  onError: (error: unknown) => void;
  reason?: 'dev' | 'location';
  now?: () => number;
  timers?: {
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    setInterval: typeof setInterval;
    clearInterval: typeof clearInterval;
  };
}) {
  let state: DesktopUpdateState = engine
    ? { status: 'idle', currentVersion }
    : { status: 'unsupported', reason, currentVersion };
  let lastSuccess: number | undefined;
  const errors = new Set<string>();
  const listeners: [string, (...args: any[]) => void][] = [];
  const set = (next: DesktopUpdateState) => {
    state = next;
    publish(state);
  };
  const error = (value: unknown) => {
    lastSuccess = undefined;
    const code =
      typeof value === 'object' && value !== null && 'code' in value
        ? String(value.code)
        : 'unknown';
    if (!errors.has(code)) {
      errors.add(code);
      onError(value);
    }
    set({
      currentVersion,
      status: 'error',
      ...('version' in state ? { version: state.version } : {}),
    });
  };
  const listen = (event: string, callback: (...args: any[]) => void) => {
    engine?.on(event, callback);
    listeners.push([event, callback]);
  };
  if (engine) {
    engine.autoDownload = false;
    engine.autoInstallOnAppQuit = false;
    engine.allowPrerelease = false;
    engine.allowDowngrade = false;
    listen('checking-for-update', () =>
      set({ currentVersion, status: 'checking' }),
    );
    listen('update-not-available', () => {
      lastSuccess = now();
      set({ currentVersion, status: 'up-to-date' });
    });
    listen('update-available', ({ version }: { version: string }) => {
      lastSuccess = now();
      set({ currentVersion, status: 'available', version });
    });
    listen('download-progress', ({ percent }: { percent: number }) => {
      if (state.status !== 'downloading' || !Number.isFinite(percent)) return;
      const rounded = Math.max(0, Math.min(100, Math.floor(percent)));
      if (rounded !== state.percent) set({ ...state, percent: rounded });
    });
    listen('update-downloaded', ({ version }: { version: string }) =>
      set({ currentVersion, status: 'downloaded', version }),
    );
    listen('error', error);
  }
  async function check() {
    if (
      !engine ||
      ['checking', 'downloading', 'downloaded', 'installing'].includes(
        state.status,
      ) ||
      (lastSuccess !== undefined && now() - lastSuccess < 600_000)
    )
      return;
    set({ currentVersion, status: 'checking' });
    try {
      await engine.checkForUpdates();
    } catch (value) {
      error(value);
    }
  }
  async function download() {
    if (!engine || state.status !== 'available') return;
    set({ ...state, status: 'downloading', percent: 0 });
    try {
      await engine.downloadUpdate();
    } catch (value) {
      error(value);
    }
  }
  function install() {
    if (!engine || state.status !== 'downloaded') return;
    set({ ...state, status: 'installing' });
    try {
      engine.quitAndInstall();
    } catch (value) {
      error(value);
    }
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  return {
    getState: () => state,
    check,
    download,
    install,
    start() {
      if (!engine || timeout !== undefined) return;
      timeout = timers.setTimeout(() => {
        void check();
      }, 15_000);
      interval = timers.setInterval(() => {
        void check();
      }, 21_600_000);
    },
    stop() {
      timers.clearTimeout(timeout);
      timers.clearInterval(interval);
      for (const [event, callback] of listeners)
        engine?.removeListener(event, callback);
    },
  };
}

export type DesktopUpdateState = { currentVersion: string } & (
  | { status: 'unsupported'; reason: 'dev' | 'location' }
  | { status: 'idle' | 'checking' | 'up-to-date' }
  | { status: 'available' | 'downloaded' | 'installing'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'error'; version?: string }
);

import type { DesktopUpdateState } from '@zapengine/types/shared';
export function updateTrayItem(
  state: DesktopUpdateState,
  actions: { download: () => void; install: () => void },
): { label: string; click?: () => void; enabled?: boolean }[] {
  switch (state.status) {
    case 'available':
      return [
        { label: `Update to ${state.version}…`, click: actions.download },
      ];
    case 'downloading':
      return [{ label: `Downloading ${state.percent}%`, enabled: false }];
    case 'downloaded':
      return [{ label: 'Restart to Update', click: actions.install }];
    default:
      return [];
  }
}

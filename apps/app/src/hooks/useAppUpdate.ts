import { useDesktopUpdate } from '@/integration/desktopBridge';
import { fromDesktopState, type AppUpdateView } from '@/integration/appUpdate';
export function useAppUpdate() {
  const desktop = useDesktopUpdate();
  const view: AppUpdateView = desktop.state
    ? fromDesktopState(desktop.state)
    : { status: 'hidden' };
  return { ...desktop, view };
}

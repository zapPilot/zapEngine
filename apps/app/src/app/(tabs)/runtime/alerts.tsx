import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import { RuntimeAlertsScreen } from '@/screens/RuntimeAlertsScreen';
export default function RuntimeAlertsRoute() {
  return (
    <ScreenCrashBoundary screen="runtime/alerts">
      <RuntimeAlertsScreen />
    </ScreenCrashBoundary>
  );
}

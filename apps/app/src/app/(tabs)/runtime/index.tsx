import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import { RuntimeScreen } from '@/screens/RuntimeScreen';
export default function RuntimeRoute() {
  return (
    <ScreenCrashBoundary screen="runtime">
      <RuntimeScreen />
    </ScreenCrashBoundary>
  );
}

import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import { FirstRunScreen } from '@/screens/FirstRunScreen';
export default function WelcomeRoute() {
  return (
    <ScreenCrashBoundary screen="welcome">
      <FirstRunScreen />
    </ScreenCrashBoundary>
  );
}

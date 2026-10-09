import { Redirect } from 'expo-router';
import { isDevBuild } from '@/config/appCoreEnv';
import { APP_ROUTES } from '@/integration/navigationModel';
import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { BridgeDiagnosticScreen } from '@/screens/invest/BridgeDiagnosticScreen';
export default function BridgeDiagnosticsRoute() {
  if (!isDevBuild()) return <Redirect href={APP_ROUTES.today} />;
  return (
    <ScreenCrashBoundary screen="bridge-diagnostics">
      <AuthenticatedRoute>
        <BridgeDiagnosticScreen />
      </AuthenticatedRoute>
    </ScreenCrashBoundary>
  );
}

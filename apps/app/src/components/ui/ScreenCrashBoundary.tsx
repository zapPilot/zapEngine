import * as Sentry from '@sentry/react-native';
import type { ReactElement, ReactNode } from 'react';

import { CrashFallbackScreen } from '@/components/ui/CrashFallbackScreen';

/**
 * Contains a render crash to one screen instead of letting it reach the root
 * boundary in `AppProviderShell`, which replaces the whole app — navigation
 * included — with the fallback.
 *
 * `screen` is tagged on the Sentry event so a crash is attributable without
 * reading the component stack.
 */
export function ScreenCrashBoundary({
  screen,
  children,
}: {
  screen: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Sentry.ErrorBoundary
      beforeCapture={(scope) => {
        scope.setTag('screen', screen);
      }}
      fallback={({ resetError }) => (
        <CrashFallbackScreen resetError={resetError} />
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}

import { type ReactElement, type ReactNode, useCallback, useMemo } from 'react';

interface AuthenticatedActionContextValue {
  run(action: () => void): void;
  cancel(): void;
}

// iOS never has a connected embedded wallet (nativePrivyPlatform.ios.ts forces
// createOnLogin: 'off'), so gating actions on account.isConnected would queue
// forever and deadlock podcast playback. Run actions immediately instead.
export function AuthenticatedActionProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <>{children}</>;
}

export function useAuthenticatedAction(): AuthenticatedActionContextValue {
  const run = useCallback((action: () => void) => {
    action();
  }, []);
  const cancel = useCallback(() => {}, []);
  return useMemo(() => ({ run, cancel }), [run, cancel]);
}

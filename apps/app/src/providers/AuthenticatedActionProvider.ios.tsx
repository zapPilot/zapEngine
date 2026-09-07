import { type ReactElement, type ReactNode } from 'react';

import { type AuthenticatedActionContextValue } from '@/integration/authenticatedActionModel';

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

const PASSTHROUGH_ACTION: AuthenticatedActionContextValue = {
  run(action) {
    action();
  },
  cancel() {},
};

export function useAuthenticatedAction(): AuthenticatedActionContextValue {
  return PASSTHROUGH_ACTION;
}

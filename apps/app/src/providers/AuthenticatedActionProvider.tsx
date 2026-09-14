import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react';

import {
  type AuthenticatedActionContextValue,
  createAuthenticatedActionModel,
} from '@/integration/authenticatedActionModel';
import { useAccount } from '@/integration/useAccount';

const AuthenticatedActionContext =
  createContext<AuthenticatedActionContextValue | null>(null);

export function AuthenticatedActionProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const account = useAccount();
  const modelRef = useRef(createAuthenticatedActionModel());

  useEffect(() => {
    if (account.isConnected) {
      modelRef.current.resume();
    }
  }, [account.isConnected]);

  const cancel = useCallback(() => {
    modelRef.current.cancel();
  }, []);

  const run = useCallback(
    (action: () => void) => {
      const needsLogin = modelRef.current.request(account.isConnected, action);
      if (needsLogin) {
        // Drop the queued action when the login does not complete, otherwise
        // it stays armed and the `isConnected` effect replays it on a later,
        // unrelated connection.
        try {
          void account
            .connect()
            .then((outcome) => {
              if (outcome === 'cancelled') {
                cancel();
              }
            })
            .catch(cancel);
        } catch {
          // Providers may fail before returning a promise. Keep the same
          // fail-closed behavior as an async rejection.
          cancel();
        }
      }
    },
    [account, cancel],
  );

  return (
    <AuthenticatedActionContext.Provider value={{ run, cancel }}>
      {children}
    </AuthenticatedActionContext.Provider>
  );
}

export function useAuthenticatedAction(): AuthenticatedActionContextValue {
  const context = useContext(AuthenticatedActionContext);
  if (context === null) {
    throw new Error(
      'useAuthenticatedAction must be used within AuthenticatedActionProvider',
    );
  }
  return context;
}

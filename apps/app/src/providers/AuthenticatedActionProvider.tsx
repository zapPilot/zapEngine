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
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (account.isConnected) {
      modelRef.current.resume();
    }
  }, [account.isConnected]);

  const cancel = useCallback(() => {
    requestIdRef.current += 1;
    modelRef.current.cancel();
  }, []);

  const run = useCallback(
    (action: () => void) => {
      const needsLogin = modelRef.current.request(account.isConnected, action);
      if (needsLogin && !account.isConnecting) {
        const requestId = ++requestIdRef.current;
        const cancelIfCurrent = () => {
          if (requestIdRef.current === requestId) {
            modelRef.current.cancel();
          }
        };

        // Drop the queued action when the login does not complete, otherwise
        // it stays armed and the `isConnected` effect replays it on a later,
        // unrelated connection. A superseded login attempt must not clear a
        // newer queued action if its promise settles afterward.
        try {
          void account
            .connect()
            .then((outcome) => {
              if (outcome === 'cancelled') {
                cancelIfCurrent();
              }
            })
            .catch(cancelIfCurrent);
        } catch {
          // Providers may fail before returning a promise. Keep the same
          // fail-closed behavior as an async rejection.
          cancelIfCurrent();
        }
      }
    },
    [account],
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

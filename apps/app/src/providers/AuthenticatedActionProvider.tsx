import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react';

import { createAuthenticatedActionModel } from '@/integration/authenticatedActionModel';
import { useAccount } from '@/integration/useAccount';

interface AuthenticatedActionContextValue {
  run(action: () => void): void;
  cancel(): void;
}

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
        void account.connect().catch(cancel);
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

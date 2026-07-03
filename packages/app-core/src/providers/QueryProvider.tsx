import { getRuntimeEnv, isRuntimeMode } from '@core/lib/env/runtimeEnv';
import { queryClient } from '@core/lib/state/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';

type ReactQueryDevtoolsComponent =
  (typeof import('@tanstack/react-query-devtools'))['ReactQueryDevtools'];

interface QueryProviderProps {
  children: ReactNode;
}

function QueryDevtoolsLoader() {
  // Resolved on mount rather than at module scope so the env injected at app
  // bootstrap (configureAppCoreEnv) is honored.
  const [enableDevtools] = useState(
    () =>
      isRuntimeMode('development') &&
      getRuntimeEnv('VITE_ENABLE_RQ_DEVTOOLS') === '1',
  );
  const [Devtools, setDevtools] = useState<ReactQueryDevtoolsComponent | null>(
    null,
  );

  useEffect(() => {
    if (!enableDevtools) {
      return;
    }

    let isMounted = true;

    async function loadDevtools(): Promise<void> {
      const mod = await import('@tanstack/react-query-devtools');
      if (isMounted) {
        setDevtools(() => mod.ReactQueryDevtools);
      }
    }

    void loadDevtools();

    return () => {
      isMounted = false;
    };
  }, [enableDevtools]);

  if (!enableDevtools || !Devtools) {
    return null;
  }

  return <Devtools initialIsOpen={false} position="bottom" />;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <QueryDevtoolsLoader />
    </QueryClientProvider>
  );
}

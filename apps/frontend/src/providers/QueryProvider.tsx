import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";

import { getRuntimeEnv, isRuntimeMode } from "@/lib/env/runtimeEnv";
import { queryClient } from "@/lib/state/queryClient";

type ReactQueryDevtoolsComponent =
  (typeof import("@tanstack/react-query-devtools"))["ReactQueryDevtools"];

interface QueryProviderProps {
  children: ReactNode;
}

const enableDevtools =
  isRuntimeMode("development") &&
  getRuntimeEnv("VITE_ENABLE_RQ_DEVTOOLS") === "1";

function QueryDevtoolsLoader() {
  const [Devtools, setDevtools] = useState<ReactQueryDevtoolsComponent | null>(
    null
  );

  useEffect(() => {
    if (!enableDevtools) {
      return;
    }

    let isMounted = true;

    async function loadDevtools(): Promise<void> {
      const mod = await import("@tanstack/react-query-devtools");
      if (isMounted) {
        setDevtools(() => mod.ReactQueryDevtools);
      }
    }

    void loadDevtools();

    return () => {
      isMounted = false;
    };
  }, []);

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

import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import type { PropsWithChildren, ReactNode } from "react";

const fallbackQueryClient = new QueryClient();

function useHasQueryClient(): boolean {
  try {
    useQueryClient();
    return true;
  } catch {
    return false;
  }
}

export function QueryClientBoundary({
  children,
}: PropsWithChildren): ReactNode {
  const hasClient = useHasQueryClient();

  if (hasClient) {
    return <>{children}</>;
  }

  return (
    <QueryClientProvider client={fallbackQueryClient}>
      {children}
    </QueryClientProvider>
  );
}

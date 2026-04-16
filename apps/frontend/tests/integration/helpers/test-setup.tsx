import {
  type DefaultOptions,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, vi } from "vitest";

import { DEFAULT_QUERY_CONFIG } from "./test-constants";

export interface TestQueryClientOptions {
  defaultOptions?: DefaultOptions;
}

export function createTestQueryClient(
  options: TestQueryClientOptions = {}
): QueryClient {
  const defaultQueryOptions = {
    queries: {
      ...DEFAULT_QUERY_CONFIG,
      ...(options.defaultOptions?.queries ?? {}),
    },
    ...(options.defaultOptions?.mutations
      ? { mutations: options.defaultOptions.mutations }
      : {}),
  } satisfies DefaultOptions;

  return new QueryClient({
    defaultOptions: defaultQueryOptions,
  });
}

export function createQueryWrapper(
  client: QueryClient = createTestQueryClient()
) {
  function QueryWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  QueryWrapper.displayName = "TestQueryWrapper";

  return { QueryWrapper, queryClient: client };
}

export function setupMockCleanup() {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });
}

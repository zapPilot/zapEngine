/**
 * Mutation hooks for strategy admin CRUD operations.
 */
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { queryKeys } from "@/lib/state/queryClient";
import {
  createStrategyConfig,
  setDefaultStrategyConfig,
  updateStrategyConfig,
} from "@/services";
import type {
  CreateStrategyConfigRequest,
  UpdateStrategyConfigRequest,
} from "@/types";

function invalidateStrategyConfigs(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.strategyAdmin.configs(),
  });
}

/**
 * Mutation hook to create a new strategy configuration.
 *
 * @returns React Query mutation for creating a config
 *
 * @example
 * ```typescript
 * const { mutateAsync: create } = useCreateStrategyConfig();
 * await create({ config_id: "my_config", ... });
 * ```
 */
export function useCreateStrategyConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateStrategyConfigRequest) =>
      createStrategyConfig(body),
    onSuccess: () => invalidateStrategyConfigs(queryClient),
  });
}

/**
 * Mutation hook to update an existing strategy configuration.
 *
 * @returns React Query mutation for updating a config
 *
 * @example
 * ```typescript
 * const { mutateAsync: update } = useUpdateStrategyConfig();
 * await update({ configId: "my_config", body: { ... } });
 * ```
 */
export function useUpdateStrategyConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      configId,
      body,
    }: {
      configId: string;
      body: UpdateStrategyConfigRequest;
    }) => updateStrategyConfig(configId, body),
    onSuccess: () => invalidateStrategyConfigs(queryClient),
  });
}

/**
 * Mutation hook to set a configuration as the default.
 *
 * @returns React Query mutation for setting default
 *
 * @example
 * ```typescript
 * const { mutateAsync: setDefault } = useSetDefaultStrategyConfig();
 * await setDefault("my_config");
 * ```
 */
export function useSetDefaultStrategyConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (configId: string) => setDefaultStrategyConfig(configId),
    onSuccess: () => invalidateStrategyConfigs(queryClient),
  });
}

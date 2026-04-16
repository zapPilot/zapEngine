import { useQuery } from "@tanstack/react-query";

import { chainServiceMock } from "@/services";
import type { ChainData } from "@/types/domain/transaction";

export function useChainQuery(chainId?: number) {
  return useQuery<ChainData[] | ChainData | null>({
    queryKey: ["chain", chainId ?? "all"],
    queryFn: async () => {
      if (typeof chainId === "number") {
        const chain = await chainServiceMock.getChainById(chainId);
        // React Query v5 doesn't allow undefined - convert to null
        return chain ?? null;
      }

      return chainServiceMock.getSupportedChains();
    },
    staleTime: Infinity,
  });
}

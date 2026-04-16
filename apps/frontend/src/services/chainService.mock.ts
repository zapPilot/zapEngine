/**
 * ⚠️ MOCK SERVICE - SIMULATION ONLY ⚠️
 *
 * This service provides simulated chain data for development and testing.
 * - Does NOT connect to real chain data providers
 * - Uses hardcoded chain configurations
 * - Returns artificial delays to simulate network requests
 *
 * @see Phase 9 - Mock Service Clarity
 * @future Replace with real chain service when backend is ready
 */

import { delay } from "@/lib/http/retry";
import type { ChainData } from "@/types/domain/transaction";

const MOCK_CHAIN_DATA: ChainData[] = [
  {
    chainId: 1,
    name: "Ethereum",
    symbol: "ETH",
    iconUrl: "/chains/eth.svg",
    isActive: true,
  },
  {
    chainId: 137,
    name: "Polygon",
    symbol: "MATIC",
    iconUrl: "/chains/polygon.svg",
    isActive: true,
  },
  {
    chainId: 42161,
    name: "Arbitrum",
    symbol: "ARB",
    iconUrl: "/chains/arbitrum.svg",
    isActive: false,
  },
];

export async function getSupportedChains(): Promise<ChainData[]> {
  await delay(120);
  return MOCK_CHAIN_DATA;
}

export async function getChainById(
  chainId: number
): Promise<ChainData | undefined> {
  await delay(120);
  return MOCK_CHAIN_DATA.find(chain => chain.chainId === chainId);
}

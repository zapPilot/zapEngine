/**
 * Chain Configuration Adapters
 *
 * This module provides adapter functions to convert canonical chain configurations
 * to different formats required by various Web3 providers and libraries.
 */

import type { BaseChainConfig } from "./types";

/**
 * Get only mainnet chains from a list
 */
export function getMainnetChains(
  configs: BaseChainConfig[]
): BaseChainConfig[] {
  return configs.filter(config => config.isSupported);
}

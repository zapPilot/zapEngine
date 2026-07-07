/**
 * Unified Chain Configuration API
 *
 * This is the main entry point for all chain-related configuration.
 * Import from this file to access chain data in any format needed.
 */

// Canonical chain definitions
export { getMainnetChains, SUPPORTED_CHAINS } from './definitions';

// Display-only metadata (names/icons/explorers) — includes HyperCore (1337),
// which is never wallet-switchable
export {
  type DisplayChainInfo,
  getDisplayChain,
  getExplorerAddressUrl,
  getExplorerTxUrl,
  HYPERCORE_CHAIN_ID,
} from './display';

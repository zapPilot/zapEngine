/**
 * Canonical Chain Definitions
 *
 * This is the single source of truth for all blockchain network configurations.
 * All other chain-related configurations should derive from these definitions.
 */

import { BaseChainConfig } from "./types";

/**
 * Mainnet Chain Configurations
 * Internal constant used by SUPPORTED_CHAINS and CHAIN_REGISTRY
 */
const MAINNET_CHAINS: BaseChainConfig[] = [
  {
    id: 42161,
    name: "Arbitrum One",
    symbol: "ARB",
    isSupported: true,
    rpcUrls: {
      default: {
        http: [
          "https://arb1.arbitrum.io/rpc",
          "https://arbitrum-one.publicnode.com",
        ],
      },
      public: {
        http: [
          "https://rpc.ankr.com/arbitrum",
          "https://arbitrum.llamarpc.com",
        ],
      },
    },
    blockExplorers: {
      default: { name: "Arbiscan", url: "https://arbiscan.io" },
      etherscan: { name: "Arbiscan", url: "https://arbiscan.io" },
    },
    iconUrl: "/chainPicturesWebp/arbitrum.webp",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    metadata: {
      blockTime: 1,
      layer: "L2",
      parentChain: 1,
    },
  },
  {
    id: 8453,
    name: "Base",
    symbol: "BASE",
    isSupported: true,
    rpcUrls: {
      default: {
        http: [
          "https://mainnet.base.org",
          "https://base-mainnet.public.blastapi.io",
        ],
      },
      public: {
        http: ["https://base.llamarpc.com", "https://rpc.ankr.com/base"],
      },
    },
    blockExplorers: {
      default: { name: "Basescan", url: "https://basescan.org" },
      etherscan: { name: "Basescan", url: "https://basescan.org" },
    },
    iconUrl: "/chainPicturesWebp/base.webp",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    metadata: {
      blockTime: 2,
      layer: "L2",
      parentChain: 1,
    },
  },
  {
    id: 10,
    name: "Optimism",
    symbol: "OP",
    isSupported: true,
    rpcUrls: {
      default: {
        http: [
          "https://mainnet.optimism.io",
          "https://optimism-mainnet.public.blastapi.io",
        ],
      },
      public: {
        http: [
          "https://optimism.llamarpc.com",
          "https://rpc.ankr.com/optimism",
        ],
      },
    },
    blockExplorers: {
      default: { name: "Etherscan", url: "https://optimistic.etherscan.io" },
      etherscan: { name: "Etherscan", url: "https://optimistic.etherscan.io" },
    },
    iconUrl: "/chainPicturesWebp/optimism.webp",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    metadata: {
      blockTime: 2,
      layer: "L2",
      parentChain: 1,
    },
  },
];

/**
 * All supported chains
 */
export const SUPPORTED_CHAINS = MAINNET_CHAINS.filter(
  chain => chain.isSupported
);

import type { Address } from "viem";

export const CHAIN_IDS = {
  ETHEREUM: 1,
  BASE: 8453,
} as const;

export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

// Native token address (used by LI.FI and most protocols)
export const NATIVE_TOKEN =
  "0x0000000000000000000000000000000000000000" as Address;

// Common tokens for POC (ETH/BTC rotation strategy)
export const TOKENS = {
  [CHAIN_IDS.ETHEREUM]: {
    ETH: NATIVE_TOKEN,
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address,
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address,
  },
  [CHAIN_IDS.BASE]: {
    ETH: NATIVE_TOKEN,
    WETH: "0x4200000000000000000000000000000000000006" as Address,
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address, // Coinbase wrapped BTC
    USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA" as Address, // Bridged USDC
  },
} as const;

// Multicall3 contract address (same on all EVM chains)
export const MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;

// Chain metadata
export const CHAIN_METADATA = {
  [CHAIN_IDS.ETHEREUM]: {
    name: "Ethereum",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorer: "https://etherscan.io",
  },
  [CHAIN_IDS.BASE]: {
    name: "Base",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    blockExplorer: "https://basescan.org",
  },
} as const;

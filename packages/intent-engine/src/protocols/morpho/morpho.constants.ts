import type { Address } from "viem";
import { CHAIN_IDS } from "../../types/chain.types.js";

/**
 * Morpho vault addresses for POC
 * These are MetaMorpho vaults (ERC-4626 compliant)
 */
export const MORPHO_VAULTS = {
  [CHAIN_IDS.ETHEREUM]: {
    // Steakhouse USDC vault - one of the most popular Morpho vaults
    STEAKHOUSE_USDC: "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB" as Address,
    // Gauntlet WETH Prime vault
    GAUNTLET_WETH: "0x4881Ef0BF6d2365D3dd6499ccd7532bcdBcE0658" as Address,
    // Re7 WETH vault
    RE7_WETH: "0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0" as Address,
  },
  [CHAIN_IDS.BASE]: {
    // Moonwell USDC vault on Base
    MOONWELL_USDC: "0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A" as Address,
    // Seamless WETH vault
    SEAMLESS_WETH: "0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1" as Address,
  },
} as const;

/**
 * Morpho MetaMorpho vault ABI (ERC-4626 + extensions)
 * Only includes functions we need for intent engine
 */
export const MORPHO_VAULT_ABI = [
  // ERC-4626 core functions
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "redeem",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  // Preview functions (read-only)
  {
    name: "previewDeposit",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "previewMint",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  {
    name: "previewWithdraw",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    name: "previewRedeem",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  // Asset and share info
  {
    name: "asset",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "totalAssets",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Max functions (for checking limits)
  {
    name: "maxDeposit",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "receiver", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "maxWithdraw",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "maxRedeem",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Gas estimates for Morpho operations
 * These are conservative estimates; actual gas may vary
 */
export const MORPHO_GAS_ESTIMATES = {
  deposit: "150000",
  withdraw: "200000",
  redeem: "200000",
} as const;

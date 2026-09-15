import type { ChainBrandKey } from '@zapengine/brand-assets';
import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  DEPOSIT_USDC_ADDRESSES,
  DEPOSIT_USDT_ADDRESSES,
  NATIVE_TOKEN_ADDRESS as DEPOSIT_NATIVE_TOKEN_ADDRESS,
  SUPPORTED_DEPOSIT_CHAINS,
} from '@zapengine/types/api';

export type DepositTokenSymbol = 'USDC' | 'USDT' | 'ETH';
export type StrategyFundingChainId =
  | typeof SUPPORTED_DEPOSIT_CHAINS.ETHEREUM
  | typeof SUPPORTED_DEPOSIT_CHAINS.BASE
  | typeof SUPPORTED_DEPOSIT_CHAINS.ARBITRUM;

export interface DesktopDepositToken {
  symbol: DepositTokenSymbol;
  name: string;
  chainId: StrategyFundingChainId;
  /** Key into `CHAIN_BRAND`, which owns the chain's label, color, and mark. */
  chainKey: Extract<ChainBrandKey, 'ethereum' | 'base' | 'arbitrum'>;
  decimals: number;
  category: 'stable' | 'crypto';
  /** Address sent to plan-orchestration deposit requests. */
  depositAddress: `0x${string}`;
  /** Address used by app-core balance reads. Native ETH uses the zero sentinel. */
  balanceAddress: `0x${string}`;
}

/**
 * Native ETH is the one token whose deposit and balance addresses differ: the
 * planner takes the EIP-7528 sentinel, the balance reader takes the zero
 * address. Shared by every chain's ETH entry.
 */
const NATIVE_ETH_ADDRESSES = {
  depositAddress: DEPOSIT_NATIVE_TOKEN_ADDRESS as `0x${string}`,
  balanceAddress: '0x0000000000000000000000000000000000000000',
} as const;

/**
 * Canonical ERC-20 addresses pulled out of the registry once. Both the deposit
 * and the balance lookup use the same address for an ERC-20; only native ETH
 * splits them (deposit sentinel vs. zero address).
 */
const ETHEREUM_USDC = DEPOSIT_USDC_ADDRESSES[
  SUPPORTED_DEPOSIT_CHAINS.ETHEREUM
]! as `0x${string}`;
const ARBITRUM_USDC = DEPOSIT_USDC_ADDRESSES[
  SUPPORTED_DEPOSIT_CHAINS.ARBITRUM
]! as `0x${string}`;
const ARBITRUM_USDT = DEPOSIT_USDT_ADDRESSES[
  SUPPORTED_DEPOSIT_CHAINS.ARBITRUM
]! as `0x${string}`;

/**
 * Ethereum mainnet funding, used only as an HLP source: the `invest` request
 * schema accepts canonical USDC or native ETH, and mainnet has no strategy
 * destination of its own.
 */
export const ETHEREUM_DEPOSIT_TOKENS = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chainId: SUPPORTED_DEPOSIT_CHAINS.ETHEREUM,
    chainKey: 'ethereum',
    decimals: 6,
    category: 'stable',
    depositAddress: ETHEREUM_USDC,
    balanceAddress: ETHEREUM_USDC,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    chainId: SUPPORTED_DEPOSIT_CHAINS.ETHEREUM,
    chainKey: 'ethereum',
    decimals: 18,
    category: 'crypto',
    ...NATIVE_ETH_ADDRESSES,
  },
] as const satisfies readonly DesktopDepositToken[];

export const BASE_DEPOSIT_TOKENS = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chainId: BASE_CHAIN_ID,
    chainKey: 'base',
    decimals: 6,
    category: 'stable',
    depositAddress: BASE_USDC_ADDRESS,
    balanceAddress: BASE_USDC_ADDRESS,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    chainId: BASE_CHAIN_ID,
    chainKey: 'base',
    decimals: 18,
    category: 'crypto',
    ...NATIVE_ETH_ADDRESSES,
  },
] as const satisfies readonly DesktopDepositToken[];

export const ARBITRUM_DEPOSIT_TOKENS = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
    chainKey: 'arbitrum',
    decimals: 6,
    category: 'stable',
    depositAddress: ARBITRUM_USDC,
    balanceAddress: ARBITRUM_USDC,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
    chainKey: 'arbitrum',
    decimals: 6,
    category: 'stable',
    depositAddress: ARBITRUM_USDT,
    balanceAddress: ARBITRUM_USDT,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
    chainKey: 'arbitrum',
    decimals: 18,
    category: 'crypto',
    ...NATIVE_ETH_ADDRESSES,
  },
] as const satisfies readonly DesktopDepositToken[];

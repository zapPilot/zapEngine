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
  | typeof SUPPORTED_DEPOSIT_CHAINS.BASE
  | typeof SUPPORTED_DEPOSIT_CHAINS.ARBITRUM;

export interface DesktopDepositToken {
  symbol: DepositTokenSymbol;
  name: string;
  chainId: StrategyFundingChainId;
  /** Key into `CHAIN_BRAND`, which owns the chain's label, color, and mark. */
  chainKey: Extract<ChainBrandKey, 'base' | 'arbitrum'>;
  decimals: number;
  category: 'stable' | 'crypto';
  /** Address sent to plan-orchestration deposit requests. */
  depositAddress: `0x${string}`;
  /** Address used by app-core balance reads. Native ETH uses the zero sentinel. */
  balanceAddress: `0x${string}`;
}

const BALANCE_NATIVE_TOKEN_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const;

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
    depositAddress: DEPOSIT_NATIVE_TOKEN_ADDRESS,
    balanceAddress: BALANCE_NATIVE_TOKEN_ADDRESS,
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
    depositAddress: DEPOSIT_USDC_ADDRESSES[
      SUPPORTED_DEPOSIT_CHAINS.ARBITRUM
    ]! as `0x${string}`,
    balanceAddress: DEPOSIT_USDC_ADDRESSES[
      SUPPORTED_DEPOSIT_CHAINS.ARBITRUM
    ]! as `0x${string}`,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
    chainKey: 'arbitrum',
    decimals: 6,
    category: 'stable',
    depositAddress: DEPOSIT_USDT_ADDRESSES[
      SUPPORTED_DEPOSIT_CHAINS.ARBITRUM
    ]! as `0x${string}`,
    balanceAddress: DEPOSIT_USDT_ADDRESSES[
      SUPPORTED_DEPOSIT_CHAINS.ARBITRUM
    ]! as `0x${string}`,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    chainId: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
    chainKey: 'arbitrum',
    decimals: 18,
    category: 'crypto',
    depositAddress: DEPOSIT_NATIVE_TOKEN_ADDRESS as `0x${string}`,
    balanceAddress: BALANCE_NATIVE_TOKEN_ADDRESS,
  },
] as const satisfies readonly DesktopDepositToken[];

export const DEFAULT_BASE_FUNDING_TOKEN = BASE_DEPOSIT_TOKENS[0];
export const DEFAULT_ARBITRUM_FUNDING_TOKEN = ARBITRUM_DEPOSIT_TOKENS[0];

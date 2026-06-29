import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  NATIVE_TOKEN_ADDRESS as DEPOSIT_NATIVE_TOKEN_ADDRESS,
} from '@zapengine/types/api';

export type DepositTokenSymbol = 'USDC' | 'ETH';

export interface DesktopDepositToken {
  symbol: DepositTokenSymbol;
  name: string;
  chainId: typeof BASE_CHAIN_ID;
  decimals: number;
  category: 'stable' | 'crypto';
  /** Address sent to plan-orchestration deposit requests. */
  depositAddress: `0x${string}`;
  /** Address used by app-core balance reads. Native ETH uses the zero sentinel. */
  balanceAddress: `0x${string}`;
  iconBg: string;
  glyph: string;
}

const BALANCE_NATIVE_TOKEN_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const;

export const BASE_DEPOSIT_TOKENS = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chainId: BASE_CHAIN_ID,
    decimals: 6,
    category: 'stable',
    depositAddress: BASE_USDC_ADDRESS,
    balanceAddress: BASE_USDC_ADDRESS,
    iconBg: '#2775ca',
    glyph: '$',
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    chainId: BASE_CHAIN_ID,
    decimals: 18,
    category: 'crypto',
    depositAddress: DEPOSIT_NATIVE_TOKEN_ADDRESS,
    balanceAddress: BALANCE_NATIVE_TOKEN_ADDRESS,
    iconBg: '#2a2a30',
    glyph: 'Ξ',
  },
] as const satisfies readonly DesktopDepositToken[];

export const DEFAULT_DEPOSIT_TOKEN = BASE_DEPOSIT_TOKENS[0];

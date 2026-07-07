import { HYPERCORE_CHAIN_ID } from '@zapengine/types/api';
import type { Address } from 'viem';

export { HYPERCORE_CHAIN_ID };

/** LI.FI's chain id for HyperEVM (key `hyp`). Unused by v1 flows. */
export const HYPEREVM_CHAIN_ID = 999;

export type HyperliquidNetwork = 'mainnet' | 'testnet';

/**
 * Exchange/info API bases. Distinct from alpha-etl's HYPERLIQUID_API_URL
 * (api-ui.hyperliquid.xyz), which is the UI data mirror and rejects
 * exchange actions.
 */
export const HYPERLIQUID_EXCHANGE_API: Record<HyperliquidNetwork, string> = {
  mainnet: 'https://api.hyperliquid.xyz',
  testnet: 'https://api.hyperliquid-testnet.xyz',
};

/**
 * LI.FI token id for perps USDC on chain 1337 ("USD Coin (Perps)", 6
 * decimals). Re-verify with GET https://li.quest/v1/tokens?chains=1337 —
 * the spot-USDC token (0x6d1e…, 8 decimals) is NOT interchangeable.
 */
export const HYPERCORE_PERPS_USDC: Address =
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

export const HYPERCORE_USDC_DECIMALS = 6;

/**
 * HLP protocol vault addresses. Re-verify with
 * POST {api}/info {"type":"vaultDetails","vaultAddress":…} — the response
 * must name "Hyperliquidity Provider (HLP)".
 */
export const HLP_VAULTS: Record<HyperliquidNetwork, Address> = {
  mainnet: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
  testnet: '0xa15099a30bbf2e68942d6f4c43d70d04faeab0a0',
};

export const HLP_VAULT_NAME = 'Hyperliquid HLP';

/** Withdrawals unlock this many days after the most recent deposit. */
export const HLP_LOCKUP_DAYS = 4;

/** Hyperliquid vault minimum deposit: 5 USDC in 6-decimal base units. */
export const HLP_MIN_DEPOSIT_USD = '5000000';

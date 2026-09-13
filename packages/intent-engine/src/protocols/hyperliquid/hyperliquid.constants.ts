import {
  HLP_MIN_DEPOSIT_USD6,
  HYPERCORE_CHAIN_ID,
  HYPERLIQUID_BRIDGE2_BRIDGE_ID,
} from '@zapengine/types/api';
import type { Address } from 'viem';

export { HYPERCORE_CHAIN_ID, HYPERLIQUID_BRIDGE2_BRIDGE_ID };

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
 * Hyperliquid's own Bridge2 escrow on Arbitrum One. Validators watch native
 * Arbitrum USDC `Transfer` events into it and credit the perp account named by
 * `Transfer.from`, so the deposit must be a plain ERC-20 transfer sent by the
 * depositing wallet itself — our Privy wallets are EIP-7702 delegated EOAs, so
 * `from` is still the user. Routing the transfer through a smart account or a
 * relayer would credit that contract instead. Deposits below 5 USDC are
 * discarded by the bridge; `HLP_MIN_DEPOSIT_USD` ($10) keeps us clear of it.
 * Re-verify with `usdcToken()` on the escrow.
 */
export const HYPERLIQUID_BRIDGE2_ADDRESS: Address =
  '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';

/** Observed Bridge2 settlement time (seconds) — one Hyperliquid block round. */
export const HYPERLIQUID_BRIDGE2_DURATION_SEC = 60;

/** Gas ceiling for the single ERC-20 transfer into Bridge2. */
export const HYPERLIQUID_BRIDGE2_GAS_LIMIT = '100000';

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

/** Hyperliquid HLP minimum deposit: 10 USDC in 6-decimal base units. */
export const HLP_MIN_DEPOSIT_USD = HLP_MIN_DEPOSIT_USD6.toString();

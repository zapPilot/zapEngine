import type { Address } from 'viem';

/**
 * Hard-coded demo wiring for the AI Wallet tab. Everything here is public
 * on-chain data or a fixed snapshot; nothing grants the app signing rights.
 */

/** The zero address is the "not deployed yet" sentinel the screen degrades on. */
export const AGENT_ADDRESS: Address =
  '0xe4b53fB6CEf05190882031709a26922761B6b08b';

export const USDC_ADDRESS: Address =
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const USDC_DECIMALS = 6;

/** Spark USDC vault (a Morpho MetaMorpho vault) on Base. */
export const VAULT_ADDRESS: Address =
  '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A';

/** Canonical Fed to Chain episode id; empty shows the fallback headline. */
export const DEMO_EPISODE_ID = '';
export const DEMO_EPISODE_LANGUAGE = 'en';
export const FALLBACK_HEADLINE =
  'Bitget hot wallet drained; attacker swaps $19.7M USDT0 into 7,111 ETH';

/** Laya's answers for the demo headline, captured once rather than re-asked. */
export const LAYA_MODEL = 'laya-rl-agent';
export const LAYA_SNAPSHOT = {
  exchangeHack: { yes: 0.9587 },
  ethPressure: { upward: 0.7751, downward: 0.1255, none: 0.0993 },
} as const;

export const EXCHANGE_HACK_THRESHOLD = 0.8;

export const DECISION_RULE_COPY =
  'If Laya flags an exchange hack (≥ 80%) and upward ETH pressure, deposit exactly 1 USDC into the Spark USDC vault on Base. The model never touches keys, contracts, or amounts.';

export const GUARDRAILS = [
  'Spend cap $5',
  'USDC → Spark vault only',
  'Simulated before signing',
  'Expires Oct 4',
] as const;

export const BLOCKSCOUT_API_URL = 'https://base.blockscout.com/api/v2';
/** Tried in order; the public Base endpoint rate-limits aggressively. */
export const BASE_RPC_URLS = [
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://1rpc.io/base',
] as const;
export const BASESCAN_URL = 'https://basescan.org';

export const ACTIVITY_POLL_INTERVAL_MS = 10_000;
export const POSITION_POLL_INTERVAL_MS = 30_000;
export const LOOP_REPLAY_STEP_MS = 700;

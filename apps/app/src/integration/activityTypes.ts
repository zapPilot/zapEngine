/**
 * Shared activity/portfolio domain types. Kept independent of the demo
 * fixture so live data hooks, screens, and components can depend on the
 * shapes without pulling in `data/demo`.
 */

import type { AllocationCategoryKey } from '@zapengine/app-core/lib/domain/allocationCategories';

export type ChainKey = 'ethereum' | 'arbitrum' | 'base';

export interface DemoAsset {
  symbol: string;
  name: string;
  usdValue: number | null;
  amountLabel: string;
  chains: ChainKey[];
}

export type MetricTone = 'neutral' | 'positive' | 'negative' | 'accent';

export type ActivityKind =
  | 'invest'
  | 'rebalance'
  | 'yield'
  | 'deposit'
  | 'withdraw'
  | 'internal-transfer'
  | 'contract-interaction'
  | 'strategy-update';

export type ActivityStatus = 'Completed' | 'Settled' | 'Applied' | 'Failed';

export interface ActivityStep {
  label: string;
  done: boolean;
}

/** Net movement of one allocation category inside an activity event. */
export interface ActivityCategoryDelta {
  category: AllocationCategoryKey;
  /** Net USD when the indexer priced the transfers; token-only otherwise. */
  usdNet: number | null;
  /** Pre-composed token-denominated label, e.g. `+5.25 USDC · −0.002 WBTC`. */
  label: string;
}

/** Per-category net flow across the loaded feed, for the summary card. */
export interface ActivityCategoryFlow extends ActivityCategoryDelta {
  /** Share (0..1) of feed events touching this category. */
  share: number;
}

export interface ActivityWalletRef {
  address: string;
  label: string;
}

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  title: string;
  amountLabel?: string;
  amountTone?: MetricTone;
  status: ActivityStatus;
  meta: string;
  time: string;
  /** Wallet in the managed bundle that produced this activity perspective. */
  wallet?: ActivityWalletRef;
  /** Portfolio-internal transfer attribution when both endpoints are bundle wallets. */
  walletTransfer?: {
    from: ActivityWalletRef;
    to: ActivityWalletRef;
  };
  /** Explicit presentation flows for events whose portfolio net delta is zero. */
  flowLabels?: string[];
  /** Dominant allocation category — drives the row's category accent. */
  category?: AllocationCategoryKey;
  categoryDeltas?: ActivityCategoryDelta[];
  chain?: ChainKey;
  /** Transaction hash when the event maps to exactly one on-chain transaction. */
  txHash?: string;
  /** Moralis-decoded method label when available. */
  methodLabel?: string;
  /** Counterparty protocol/entity label. Known protocols resolve to brand marks. */
  protocol?: string;
  /** Native-chain transaction fee, preformatted for the activity card footer. */
  gasFeeLabel?: string;
  /** Primary token, retained for filtering/semantic summaries. */
  tokenSymbol?: string;
  steps?: ActivityStep[];
}

export interface ActivityGroup {
  label: string;
  events: ActivityEvent[];
}

export type ActivityFilter = 'All' | AllocationCategoryKey;

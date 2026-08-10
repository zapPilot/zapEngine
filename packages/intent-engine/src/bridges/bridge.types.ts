import type { Address, Hash } from 'viem';

import type { PreparedTransaction } from '../types/transaction.types.js';

export type BridgeProviderId = 'eco' | 'across' | 'lifi';

export interface BridgeQuoteRequest {
  fromChainId: number;
  toChainId: number;
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
  sender: Address;
  recipient: Address;
}

export interface BridgeQuote {
  provider: BridgeProviderId;
  fromChainId: number;
  toChainId: number;
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  feeUsd: string;
  gasUsd: string;
  estimatedDurationSec: number;
  approvals: PreparedTransaction[];
  calls: PreparedTransaction[];
  expiresAt?: number;
  providerData: unknown;
}

export interface BridgeSettlement {
  status: 'pending' | 'filled' | 'settled' | 'failed';
  sourceTxHash: Hash;
  destinationTxHash?: Hash;
  providerData?: unknown;
}

export interface BridgeSelection {
  selected: BridgeQuote;
  alternatives: BridgeQuote[];
}

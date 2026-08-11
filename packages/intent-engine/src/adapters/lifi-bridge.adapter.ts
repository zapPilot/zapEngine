import type { Hash } from 'viem';

import { buildApproveTx } from '../approvals/erc20Approval.js';
import {
  bridgeSettlement,
  isCanonicalBaseArbitrumUsdc,
  pollBridgeStatus,
  quoteIdentity,
  signalOptions,
  type BridgeProvider,
  type BridgeQuote,
  type BridgeQuoteRequest,
  type BridgeSettlement,
  type BridgeTrackingInput,
  type FetchLike,
} from '../bridges/bridge-runtime.js';
import type { LiFiAdapter } from './lifi.adapter.js';

export interface LiFiBridgeAdapterConfig {
  fetch?: FetchLike;
  statusBaseUrl?: string;
  allowCanonical?: boolean;
}

interface LiFiStatus {
  status: string;
  substatus?: string;
  receiving?: { txHash?: Hash };
}

export class LiFiBridgeAdapter implements BridgeProvider {
  readonly id = 'lifi' as const;
  private readonly fetcher: FetchLike;

  constructor(
    private readonly lifi: LiFiAdapter,
    private readonly config: LiFiBridgeAdapterConfig = {},
  ) {
    this.fetcher = config.fetch ?? fetch;
  }

  supports(request: BridgeQuoteRequest): boolean {
    return (
      this.config.allowCanonical === true ||
      !isCanonicalBaseArbitrumUsdc(request)
    );
  }

  async quote(request: BridgeQuoteRequest): Promise<BridgeQuote> {
    const quote = await this.lifi.getQuote({
      fromChain: request.fromChainId,
      toChain: request.toChainId,
      fromToken: request.fromToken,
      toToken: request.toToken,
      fromAmount: request.fromAmount,
      fromAddress: request.sender,
      toAddress: request.recipient,
      intentType: 'BRIDGE',
    });
    return {
      provider: this.id,
      ...quoteIdentity(request),
      fromAmount: quote.estimate.fromAmount,
      toAmount: quote.estimate.toAmount,
      toAmountMin: quote.estimate.toAmountMin,
      feeUsd: quote.estimate.feeCostUsd,
      gasUsd: quote.estimate.gasCostUsd,
      estimatedDurationSec: quote.estimate.executionDuration,
      approvals: quote.approval
        ? [
            buildApproveTx({
              token: quote.approval.tokenAddress,
              spender: quote.approval.spenderAddress,
              amount: quote.approval.amount,
              chainId: request.fromChainId,
              intentType: 'BRIDGE_APPROVAL',
            }),
          ]
        : [],
      calls: [quote.transaction],
      providerData: quote.route ?? quote,
    };
  }

  async waitForCompletion(
    input: BridgeTrackingInput,
  ): Promise<BridgeSettlement> {
    const fromChainId = input.quote?.fromChainId ?? input.fromChainId;
    const toChainId = input.quote?.toChainId ?? input.toChainId;
    if (!fromChainId || !toChainId) {
      throw new Error(
        'LI.FI bridge tracking requires source and destination chain IDs',
      );
    }
    const fetchStatus = async (): Promise<LiFiStatus> => {
      const params = new URLSearchParams({
        txHash: input.sourceTxHash,
        fromChain: fromChainId.toString(),
        toChain: toChainId.toString(),
      });
      const response = await this.fetcher(
        `${this.config.statusBaseUrl ?? 'https://li.quest/v1'}/status?${params}`,
        signalOptions(input.signal),
      );
      if (!response.ok) {
        throw new Error(`LI.FI status failed: ${response.status}`);
      }
      return (await response.json()) as LiFiStatus;
    };
    const status = await pollBridgeStatus({
      fetchStatus,
      isTerminal: (value) =>
        ['DONE', 'FAILED', 'INVALID'].includes(value.status),
      ...signalOptions(input.signal),
    });
    return bridgeSettlement({
      status: status.status === 'DONE' ? 'settled' : 'failed',
      sourceTxHash: input.sourceTxHash,
      destinationTxHash: status.receiving?.txHash,
      providerData: status,
    });
  }
}

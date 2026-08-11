import type { Address, Hash, Hex } from 'viem';

import * as BridgeRuntime from '../bridges/bridge-runtime.js';
import type { PreparedTransaction } from '../types/transaction.types.js';

const DEFAULT_ACROSS_API = 'https://app.across.to/api';

export interface AcrossBridgeConfig {
  apiKey?: string | undefined;
  integratorId: string;
  baseUrl?: string;
  fetch?: BridgeRuntime.FetchLike;
}

interface AcrossTransaction {
  to: Address;
  data: Hex;
  value?: string;
  gas?: string;
  gasLimit?: string;
  chainId?: number;
}

interface AcrossApprovalResponse {
  approvalTxns?: AcrossTransaction[];
  swapTx: AcrossTransaction;
  inputAmount: string;
  expectedOutputAmount: string;
  minOutputAmount: string;
  expectedFillTime?: number;
  quoteExpiryTimestamp?: number | string;
  fees?: {
    originGas?: { amountUsd?: string };
    total?: { amountUsd?: string };
    totalFeeUsd?: string;
  };
}

interface AcrossStatusResponse {
  status?: string;
  fillTx?: Hash;
  destinationTxHash?: Hash;
}

function prepared(
  tx: AcrossTransaction,
  chainId: number,
  intentType: string,
): PreparedTransaction {
  return {
    to: tx.to,
    data: tx.data,
    value: tx.value ?? '0',
    chainId: tx.chainId ?? chainId,
    ...((tx.gasLimit ?? tx.gas) ? { gasLimit: tx.gasLimit ?? tx.gas } : {}),
    meta: { intentType },
  };
}

function statusKind(
  status: string | undefined,
): BridgeRuntime.BridgeSettlement['status'] {
  return BridgeRuntime.normalizeBridgeStatus(status, {
    filled: ['filled', 'success'],
    settled: ['settled'],
    failed: ['failed', 'expired', 'refunded'],
  });
}

export class AcrossBridgeAdapter extends BridgeRuntime.CanonicalBridgeProvider<AcrossStatusResponse> {
  readonly id = 'across' as const;

  constructor(private readonly config: AcrossBridgeConfig) {
    super();
  }

  async quote(
    request: BridgeRuntime.BridgeQuoteRequest,
  ): Promise<BridgeRuntime.BridgeQuote> {
    const params = new URLSearchParams({
      tradeType: 'exactInput',
      amount: request.fromAmount,
      inputToken: request.fromToken,
      outputToken: request.toToken,
      originChainId: request.fromChainId.toString(),
      destinationChainId: request.toChainId.toString(),
      depositor: request.sender,
      recipient: request.recipient,
      integratorId: this.config.integratorId,
    });
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    const response = await (this.config.fetch ?? fetch)(
      `${this.config.baseUrl ?? DEFAULT_ACROSS_API}/swap/approval?${params}`,
      { headers },
    );
    if (!response.ok) {
      throw new Error(`Across quote failed: ${response.status}`);
    }
    const data = (await response.json()) as AcrossApprovalResponse;
    const calls = [prepared(data.swapTx, request.fromChainId, 'BRIDGE')];
    const expiry =
      data.quoteExpiryTimestamp === undefined
        ? undefined
        : Number(data.quoteExpiryTimestamp);
    return {
      provider: this.id,
      ...BridgeRuntime.quoteIdentity(request),
      fromAmount: data.inputAmount,
      toAmount: data.expectedOutputAmount,
      toAmountMin: data.minOutputAmount,
      feeUsd: data.fees?.totalFeeUsd ?? data.fees?.total?.amountUsd ?? '0',
      gasUsd: data.fees?.originGas?.amountUsd ?? '0',
      estimatedDurationSec: data.expectedFillTime ?? 0,
      approvals: (data.approvalTxns ?? []).map((tx) =>
        prepared(tx, request.fromChainId, 'BRIDGE_APPROVAL'),
      ),
      calls,
      ...(Number.isFinite(expiry) ? { expiresAt: expiry } : {}),
      providerData: data,
    };
  }

  protected async fetchStatus(
    input: BridgeRuntime.BridgeTrackingInput,
  ): Promise<AcrossStatusResponse> {
    const params = new URLSearchParams({ depositTxnRef: input.sourceTxHash });
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    const response = await (this.config.fetch ?? fetch)(
      `${this.config.baseUrl ?? DEFAULT_ACROSS_API}/deposit/status?${params}`,
      { headers, ...BridgeRuntime.signalOptions(input.signal) },
    );
    if (!response.ok) {
      throw new Error(`Across status failed: ${response.status}`);
    }
    return (await response.json()) as AcrossStatusResponse;
  }

  protected settlementStatus(
    value: AcrossStatusResponse,
  ): BridgeRuntime.BridgeSettlement['status'] {
    return statusKind(value.status);
  }

  protected destinationTxHash(value: AcrossStatusResponse): Hash | undefined {
    return value.fillTx ?? value.destinationTxHash;
  }
}

import { encodeFunctionData, type Address, type Hash, type Hex } from 'viem';

import { buildApproveTx } from '../approvals/erc20Approval.js';
import * as BridgeRuntime from '../bridges/bridge-runtime.js';

const DEFAULT_ECO_API = 'https://quotes.eco.com/api/v3';

export interface EcoBridgeConfig {
  dAppId: string;
  baseUrl?: string;
  fetch?: BridgeRuntime.FetchLike;
}

interface EcoQuoteResponse {
  data?: Array<{
    quoteID: string;
    solverID?: string;
    quoteData: {
      contracts: {
        sourcePortal: Address;
        destinationPortal?: Address;
        prover: Address;
      };
      quoteResponse: {
        intentExecutionType: string;
        sourceChainID: number;
        destinationChainID: number;
        sourceToken: Address;
        destinationToken: Address;
        sourceAmount: string;
        destinationAmount: string;
        funder: Address;
        refundRecipient: Address;
        recipient: Address;
        deadline: number | string;
        estimatedFulfillTimeSec?: number;
        encodedRoute: Hex;
        fees?: Array<{
          amount: string;
          token?: { decimals?: number; symbol?: string };
        }>;
      };
    };
  }>;
}

interface EcoFee {
  amount: string;
  token?: { decimals?: number; symbol?: string };
}

interface EcoStatusResponse {
  data?: {
    status?: { status?: string; subStatus?: string };
    fulfillment?: { transactionHash?: Hash };
  };
}

const portalAbi = [
  {
    type: 'function',
    name: 'publishAndFund',
    stateMutability: 'payable',
    inputs: [
      { name: 'destination', type: 'uint64' },
      { name: 'route', type: 'bytes' },
      {
        name: 'reward',
        type: 'tuple',
        components: [
          { name: 'deadline', type: 'uint64' },
          { name: 'creator', type: 'address' },
          { name: 'prover', type: 'address' },
          { name: 'nativeAmount', type: 'uint256' },
          {
            name: 'tokens',
            type: 'tuple[]',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
      },
      { name: 'allowPartial', type: 'bool' },
    ],
    outputs: [
      { name: 'intentHash', type: 'bytes32' },
      { name: 'vault', type: 'address' },
    ],
  },
] as const;

function feeToUsd(fees: EcoFee[] | undefined): string {
  if (!Array.isArray(fees)) return '0';
  const micros = fees.reduce((sum, fee) => {
    if (fee.token?.symbol && fee.token.symbol.toUpperCase() !== 'USDC') {
      return sum;
    }
    const decimals = fee.token?.decimals ?? 6;
    if (decimals === 6) return sum + BigInt(fee.amount);
    if (decimals > 6) {
      return sum + BigInt(fee.amount) / 10n ** BigInt(decimals - 6);
    }
    return sum + BigInt(fee.amount) * 10n ** BigInt(6 - decimals);
  }, 0n);
  return `${micros / 1_000_000n}.${(micros % 1_000_000n).toString().padStart(6, '0')}`;
}

function settlementStatus(
  status: string | undefined,
): BridgeRuntime.BridgeSettlement['status'] {
  return BridgeRuntime.normalizeBridgeStatus(status, {
    filled: ['fulfilled', 'filled'],
    settled: ['settled', 'complete', 'completed'],
    failed: ['failed', 'refunded', 'expired'],
  });
}

export class EcoBridgeAdapter implements BridgeRuntime.BridgeProvider {
  readonly id = 'eco' as const;
  private readonly fetcher: BridgeRuntime.FetchLike;

  constructor(private readonly config: EcoBridgeConfig) {
    this.fetcher = config.fetch ?? fetch;
  }

  supports(request: BridgeRuntime.BridgeQuoteRequest): boolean {
    return BridgeRuntime.isCanonicalBaseArbitrumUsdc(request);
  }

  async quote(
    request: BridgeRuntime.BridgeQuoteRequest,
  ): Promise<BridgeRuntime.BridgeQuote> {
    const response = await this.fetcher(
      `${this.config.baseUrl ?? DEFAULT_ECO_API}/quotes/exactIn`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          dAppID: this.config.dAppId,
          intentExecutionTypes: ['SELF_PUBLISH'],
          quoteRequest: {
            sourceChainID: request.fromChainId,
            destinationChainID: request.toChainId,
            sourceToken: request.fromToken,
            destinationToken: request.toToken,
            sourceAmount: request.fromAmount,
            funder: request.sender,
            recipient: request.recipient,
            refundRecipient: request.sender,
          },
        }),
      },
    );
    if (!response.ok) throw new Error(`Eco quote failed: ${response.status}`);
    const payload = (await response.json()) as EcoQuoteResponse;
    const selected = payload.data?.find(
      (item) =>
        item.quoteData.quoteResponse.intentExecutionType === 'SELF_PUBLISH',
    );
    if (!selected) throw new Error('Eco returned no SELF_PUBLISH quote');

    const quote = selected.quoteData.quoteResponse;
    const contracts = selected.quoteData.contracts;
    const deadline = BigInt(quote.deadline);
    const data = encodeFunctionData({
      abi: portalAbi,
      functionName: 'publishAndFund',
      args: [
        BigInt(request.toChainId),
        quote.encodedRoute,
        {
          deadline,
          creator: request.sender,
          prover: contracts.prover,
          nativeAmount: 0n,
          tokens: [
            { token: request.fromToken, amount: BigInt(request.fromAmount) },
          ],
        },
        false,
      ],
    });

    return {
      provider: this.id,
      ...BridgeRuntime.quoteIdentity(request),
      fromAmount: quote.sourceAmount,
      toAmount: quote.destinationAmount,
      toAmountMin: quote.destinationAmount,
      feeUsd: feeToUsd(quote.fees),
      gasUsd: '0',
      estimatedDurationSec: quote.estimatedFulfillTimeSec ?? 0,
      approvals: [
        buildApproveTx({
          token: request.fromToken,
          spender: contracts.sourcePortal,
          amount: request.fromAmount,
          chainId: request.fromChainId,
          intentType: 'BRIDGE_APPROVAL',
        }),
      ],
      calls: [
        {
          to: contracts.sourcePortal,
          data,
          value: '0',
          chainId: request.fromChainId,
          meta: {
            intentType: 'BRIDGE',
            estimatedDuration: quote.estimatedFulfillTimeSec ?? 0,
          },
        },
      ],
      expiresAt: Number(deadline),
      providerData: selected,
    };
  }

  async waitForCompletion(
    input: BridgeRuntime.BridgeTrackingInput,
  ): Promise<BridgeRuntime.BridgeSettlement> {
    const fetchStatus = async (): Promise<EcoStatusResponse> => {
      const response = await this.fetcher(
        `${this.config.baseUrl ?? DEFAULT_ECO_API}/intents/intentStatus`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ intentCreatedHash: input.sourceTxHash }),
          ...BridgeRuntime.signalOptions(input.signal),
        },
      );
      if (!response.ok) {
        throw new Error(`Eco status failed: ${response.status}`);
      }
      return (await response.json()) as EcoStatusResponse;
    };
    const payload = await BridgeRuntime.pollBridgeStatus({
      fetchStatus,
      isTerminal: (value) =>
        settlementStatus(value.data?.status?.status) !== 'pending',
      ...BridgeRuntime.signalOptions(input.signal),
    });
    const status = settlementStatus(payload.data?.status?.status);
    return BridgeRuntime.bridgeSettlement({
      status,
      sourceTxHash: input.sourceTxHash,
      destinationTxHash: payload.data?.fulfillment?.transactionHash,
      providerData: payload,
    });
  }
}

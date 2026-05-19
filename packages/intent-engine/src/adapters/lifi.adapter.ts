import {
  createConfig,
  getQuote as getLiFiQuote,
  getContractCallsQuote,
  getToken as getLiFiToken,
  type QuoteRequest,
  type ContractCallsQuoteRequest,
} from '@lifi/sdk';
import type { Address } from 'viem';

import { QuoteError } from '../errors/intent.errors.js';
import type {
  TransactionQuote,
  PreparedTransaction,
} from '../types/transaction.types.js';

// LI.FI getQuote returns a step with transactionRequest
interface LiFiQuoteResponse {
  id: string;
  type: string;
  tool: string;
  action: {
    fromChainId: number;
    toChainId: number;
    fromToken: { address: string; symbol: string; decimals: number };
    toToken: { address: string; symbol: string; decimals: number };
    fromAmount: string;
  };
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    approvalAddress?: string;
    executionDuration?: number;
    gasCosts?: Array<{ amountUSD?: string }>;
  };
  transactionRequest?: {
    to: string;
    data: string;
    value?: string;
    gasLimit?: string;
  };
}

export interface LiFiAdapterConfig {
  integrator: string;
  apiKey?: string;
}

/**
 * Lightweight token metadata + spot USD price, sourced from LI.FI's
 * `getToken` endpoint. Used for valuing wallet balances without
 * requiring a swap/route quote.
 */
export interface LiFiTokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  /** Spot price in USD, as a decimal string (LI.FI native format) */
  priceUSD: string;
}

interface QuoteParams {
  fromChain: number;
  toChain: number;
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
  fromAddress: Address;
  toAddress?: Address;
  slippageBps?: number;
}

function isNativeTokenAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === '0x0000000000000000000000000000000000000000' ||
    normalized === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  );
}

// Normalize an EVM JSON-RPC quantity (hex `0x186a0`, decimal `100000`, or
// empty/missing) into a base-unit decimal-integer string. Returns `undefined`
// for empty/missing input so optional schema fields stay absent.
function toBaseUnitString(input: string | undefined): string | undefined {
  if (input === undefined || input === '' || input === '0x') {
    return undefined;
  }
  return BigInt(input).toString(10);
}

export class LiFiAdapter {
  private initialized = false;

  constructor(private readonly config: LiFiAdapterConfig) {}

  private ensureInitialized(): void {
    if (!this.initialized) {
      createConfig({
        integrator: this.config.integrator,
        apiKey: this.config.apiKey,
      });
      this.initialized = true;
    }
  }

  private buildQuoteRequest(_params: QuoteParams): QuoteRequest {
    throw new Error('Not implemented - use getQuote directly');
  }

  /**
   * Get a simple swap quote (same-chain or cross-chain)
   */
  async getSwapQuote(
    params: Parameters<typeof this.buildQuoteRequest>[0],
  ): Promise<TransactionQuote> {
    return this.getQuote({ ...params, intentType: 'SWAP' });
  }

  /**
   * Get a route quote and preserve whether the caller is composing a bridge
   * or a plain swap in the returned transaction metadata.
   */
  async getQuote(
    params: QuoteParams & { intentType?: 'SWAP' | 'BRIDGE' | 'SUPPLY' },
  ): Promise<TransactionQuote> {
    this.ensureInitialized();

    try {
      const request: QuoteRequest = {
        fromChain: params.fromChain,
        toChain: params.toChain,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromAmount: params.fromAmount,
        fromAddress: params.fromAddress,
        toAddress: params.toAddress ?? params.fromAddress,
        slippage: (params.slippageBps ?? 50) / 10000,
      };
      const quote = await getLiFiQuote(request);
      return this.mapQuoteToTransaction(
        quote as unknown as LiFiQuoteResponse,
        params.intentType ??
          (params.fromChain === params.toChain ? 'SWAP' : 'BRIDGE'),
      );
    } catch (error) {
      throw new QuoteError('Failed to get quote from LI.FI', {
        cause: error,
      });
    }
  }

  /**
   * Get quote with custom contract calls
   * Use this for complex protocol interactions
   */
  async getContractCallQuote(
    params: {
      fromChain: number;
      toChain: number;
      fromToken: Address;
      toToken: Address;
      fromAddress: Address;
      contractCalls: Array<{
        fromAmount: string;
        fromTokenAddress: Address;
        toContractAddress: Address;
        toContractCallData: `0x${string}`;
        toContractGasLimit: string;
      }>;
    } & ({ fromAmount: string } | { toAmount: string }),
  ): Promise<TransactionQuote> {
    this.ensureInitialized();

    try {
      const baseRequest = {
        fromChain: params.fromChain,
        toChain: params.toChain,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromAddress: params.fromAddress,
        contractCalls: params.contractCalls,
      };
      const request: ContractCallsQuoteRequest =
        'fromAmount' in params
          ? { ...baseRequest, fromAmount: params.fromAmount }
          : { ...baseRequest, toAmount: params.toAmount };

      const quote = await getContractCallsQuote(request);
      return this.mapQuoteToTransaction(
        quote as unknown as LiFiQuoteResponse,
        'SUPPLY',
      );
    } catch (error) {
      throw new QuoteError('Failed to get contract call quote from LI.FI', {
        cause: error,
      });
    }
  }

  /**
   * Fetch token metadata and spot USD price from LI.FI.
   *
   * Unlike the quote methods this performs no routing — it is a cheap
   * single lookup intended for valuing wallet balances. Stablecoins
   * (e.g. USDC) resolve to ~$1 from the same call, so no special-casing
   * is required by callers.
   */
  async getTokenPrice(
    chainId: number,
    tokenAddress: string,
  ): Promise<LiFiTokenInfo> {
    this.ensureInitialized();

    try {
      const token = await getLiFiToken(
        chainId as Parameters<typeof getLiFiToken>[0],
        tokenAddress,
      );
      return {
        address: token.address,
        symbol: token.symbol,
        decimals: token.decimals,
        priceUSD: token.priceUSD,
      };
    } catch (error) {
      throw new QuoteError('Failed to get token price from LI.FI', {
        cause: error,
      });
    }
  }

  /**
   * Map LI.FI quote response to our TransactionQuote format
   */
  private mapQuoteToTransaction(
    quote: LiFiQuoteResponse,
    intentType: string,
  ): TransactionQuote {
    if (!quote.transactionRequest) {
      throw new QuoteError('No transaction in quote response');
    }

    const tx = quote.transactionRequest;
    const executionDuration = quote.estimate.executionDuration ?? 0;

    const transaction: PreparedTransaction = {
      to: tx.to as Address,
      data: tx.data as `0x${string}`,
      value: toBaseUnitString(tx.value) ?? '0',
      chainId: quote.action.fromChainId,
      gasLimit: toBaseUnitString(tx.gasLimit),
      meta: {
        intentType,
        estimatedGas: toBaseUnitString(tx.gasLimit),
        estimatedDuration: executionDuration,
        route: quote,
      },
    };

    // Check if approval is needed
    const approval =
      quote.estimate.approvalAddress &&
      !isNativeTokenAddress(quote.action.fromToken.address)
        ? {
            tokenAddress: quote.action.fromToken.address as Address,
            spenderAddress: quote.estimate.approvalAddress as Address,
            amount: quote.action.fromAmount,
          }
        : undefined;

    // Calculate gas cost from gasCosts array
    const gasCostUsd =
      quote.estimate.gasCosts
        ?.reduce((sum, gc) => sum + parseFloat(gc.amountUSD ?? '0'), 0)
        .toString() ?? '0';

    return {
      transaction,
      estimate: {
        fromAmount: quote.estimate.fromAmount,
        toAmount: quote.estimate.toAmount,
        toAmountMin: quote.estimate.toAmountMin,
        gasCostUsd,
        executionDuration,
      },
      approval,
      route: quote,
    };
  }
}

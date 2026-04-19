import {
  createConfig,
  getQuote,
  getContractCallsQuote,
  type QuoteRequest,
  type ContractCallsQuoteRequest,
} from "@lifi/sdk";
import type { Address } from "viem";

import { QuoteError } from "../errors/intent.errors.js";
import type {
  TransactionQuote,
  PreparedTransaction,
} from "../types/transaction.types.js";

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

  /**
   * Get a simple swap quote (same-chain or cross-chain)
   */
  async getSwapQuote(params: {
    fromChain: number;
    toChain: number;
    fromToken: Address;
    toToken: Address;
    fromAmount: string;
    fromAddress: Address;
    toAddress?: Address;
    slippageBps?: number;
  }): Promise<TransactionQuote> {
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
        slippage: (params.slippageBps ?? 50) / 10000, // Convert bps to decimal
      };

      const quote = await getQuote(request);
      return this.mapQuoteToTransaction(
        quote as unknown as LiFiQuoteResponse,
        "SWAP"
      );
    } catch (error) {
      throw new QuoteError("Failed to get swap quote from LI.FI", {
        cause: error,
      });
    }
  }

  /**
   * Get quote with custom contract calls
   * Use this for complex protocol interactions
   */
  async getContractCallQuote(params: {
    fromChain: number;
    toChain: number;
    fromToken: Address;
    toToken: Address;
    toAmount: string;
    fromAddress: Address;
    contractCalls: Array<{
      fromAmount: string;
      fromTokenAddress: Address;
      toContractAddress: Address;
      toContractCallData: `0x${string}`;
      toContractGasLimit: string;
    }>;
  }): Promise<TransactionQuote> {
    this.ensureInitialized();

    try {
      const request: ContractCallsQuoteRequest = {
        fromChain: params.fromChain,
        toChain: params.toChain,
        fromToken: params.fromToken,
        toToken: params.toToken,
        toAmount: params.toAmount,
        fromAddress: params.fromAddress,
        contractCalls: params.contractCalls,
      };

      const quote = await getContractCallsQuote(request);
      return this.mapQuoteToTransaction(
        quote as unknown as LiFiQuoteResponse,
        "SUPPLY"
      );
    } catch (error) {
      throw new QuoteError("Failed to get contract call quote from LI.FI", {
        cause: error,
      });
    }
  }

  /**
   * Map LI.FI quote response to our TransactionQuote format
   */
  private mapQuoteToTransaction(
    quote: LiFiQuoteResponse,
    intentType: string
  ): TransactionQuote {
    if (!quote.transactionRequest) {
      throw new QuoteError("No transaction in quote response");
    }

    const tx = quote.transactionRequest;
    const executionDuration = quote.estimate.executionDuration ?? 0;

    const transaction: PreparedTransaction = {
      to: tx.to as Address,
      data: tx.data as `0x${string}`,
      value: (tx.value ?? "0").toString(),
      chainId: quote.action.fromChainId,
      gasLimit: tx.gasLimit,
      meta: {
        intentType,
        estimatedGas: tx.gasLimit,
        estimatedDuration: executionDuration,
        route: quote,
      },
    };

    // Check if approval is needed
    const approval =
      quote.estimate.approvalAddress &&
      quote.action.fromToken.address !==
        "0x0000000000000000000000000000000000000000"
        ? {
            tokenAddress: quote.action.fromToken.address as Address,
            spenderAddress: quote.estimate.approvalAddress as Address,
            amount: quote.action.fromAmount,
          }
        : undefined;

    // Calculate gas cost from gasCosts array
    const gasCostUsd =
      quote.estimate.gasCosts
        ?.reduce((sum, gc) => sum + parseFloat(gc.amountUSD ?? "0"), 0)
        .toString() ?? "0";

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

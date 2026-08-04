import { extractErrorMessage } from '@core/lib/errors';
import { sendPreparedTransaction } from '@core/lib/wallet/sendPreparedTransaction';
import { useWalletProvider } from '@core/providers/walletContext';
import {
  getPerpUsdcBalance,
  waitForPerpUsdcArrival,
} from '@core/services/hyperliquidService';
import {
  getPublicClient,
  intentEngine,
  waitForBridgeCompletion,
} from '@core/services/intentClient';
import {
  buildApproveTx,
  HYPERCORE_CHAIN_ID,
  needsApproval,
  type TransactionQuote,
} from '@zapengine/intent-engine';
import { useCallback, useRef, useState } from 'react';
import { type Address, erc20Abi, getAddress, type Hash } from 'viem';

export type BridgeTestStatus =
  | 'idle'
  | 'quoting'
  | 'ready'
  | 'awaitingApproval'
  | 'awaitingBridgeSignature'
  | 'sourceSubmitted'
  | 'bridging'
  | 'confirmingDestination'
  | 'completed'
  | 'failed';

export interface BridgeTestRequest {
  fromChainId: number;
  toChainId: number;
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
}

export interface BridgeTestState {
  status: BridgeTestStatus;
  quote: TransactionQuote | null;
  sourceTxHash: Hash | null;
  destinationTxHash: Hash | null;
  lifiScanUrl: string | null;
  error: string | null;
}

const INITIAL_STATE: BridgeTestState = {
  status: 'idle',
  quote: null,
  sourceTxHash: null,
  destinationTxHash: null,
  lifiScanUrl: null,
  error: null,
};

function assertRequest(request: BridgeTestRequest): void {
  if (request.fromChainId === request.toChainId) {
    throw new Error('Source and destination chains must be different.');
  }
  if (request.fromChainId === HYPERCORE_CHAIN_ID) {
    throw new Error('Hyperliquid outbound bridging is not supported yet.');
  }
  if (!/^\d+$/u.test(request.fromAmount) || BigInt(request.fromAmount) <= 0n) {
    throw new Error('Enter a USDC amount greater than zero.');
  }
}

async function buildFreshQuote(
  request: BridgeTestRequest,
  userAddress: Address,
): Promise<TransactionQuote> {
  assertRequest(request);
  return intentEngine.buildBridge({
    fromChainId: request.fromChainId,
    toChainId: request.toChainId,
    fromToken: request.fromToken,
    toToken: request.toToken,
    fromAmount: request.fromAmount,
    userAddress,
  });
}

async function assertFundingAndEstimateGas(params: {
  request: BridgeTestRequest;
  quote: TransactionQuote;
  userAddress: Address;
  includeApproval: boolean;
}): Promise<void> {
  const publicClient = getPublicClient(params.request.fromChainId);
  const tokenBalance = await publicClient.readContract({
    address: params.request.fromToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [params.userAddress],
  });
  if (tokenBalance < BigInt(params.request.fromAmount)) {
    throw new Error('USDC balance is too low for this bridge amount.');
  }

  const bridgeTx = params.quote.transaction;
  const bridgeGas = await publicClient.estimateGas({
    account: params.userAddress,
    to: bridgeTx.to as Address,
    data: bridgeTx.data as `0x${string}`,
    value: BigInt(bridgeTx.value),
  });
  let totalGas = bridgeGas;

  if (params.includeApproval && params.quote.approval) {
    const approvalTx = buildApproveTx({
      token: params.quote.approval.tokenAddress,
      spender: params.quote.approval.spenderAddress,
      amount: params.quote.approval.amount,
      chainId: params.request.fromChainId,
      intentType: 'BRIDGE_APPROVAL',
    });
    totalGas += await publicClient.estimateGas({
      account: params.userAddress,
      to: approvalTx.to as Address,
      data: approvalTx.data as `0x${string}`,
      value: 0n,
    });
  }

  const [nativeBalance, gasPrice] = await Promise.all([
    publicClient.getBalance({ address: params.userAddress }),
    publicClient.getGasPrice(),
  ]);
  const requiredNative = BigInt(bridgeTx.value) + totalGas * gasPrice;
  if (nativeBalance < requiredNative) {
    throw new Error('ETH balance is too low to pay bridge and approval gas.');
  }
}

export function useBridgeTest() {
  const wallet = useWalletProvider();
  const [state, setState] = useState<BridgeTestState>(INITIAL_STATE);
  const quoteRequestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const prepare = useCallback(
    async (request: BridgeTestRequest): Promise<TransactionQuote | null> => {
      const requestId = ++quoteRequestId.current;
      const address = wallet.account?.address;
      if (!address) {
        setState({
          ...INITIAL_STATE,
          status: 'failed',
          error: 'Connect a wallet to request a bridge quote.',
        });
        return null;
      }

      setState((current) => ({
        ...current,
        status: 'quoting',
        quote: null,
        error: null,
      }));
      try {
        const quote = await buildFreshQuote(request, getAddress(address));
        if (requestId !== quoteRequestId.current) return null;
        setState((current) => ({
          ...current,
          status: 'ready',
          quote,
          error: null,
        }));
        return quote;
      } catch (error) {
        if (requestId !== quoteRequestId.current) return null;
        setState((current) => ({
          ...current,
          status: 'failed',
          quote: null,
          error: extractErrorMessage(error, 'Unable to prepare bridge quote'),
        }));
        return null;
      }
    },
    [wallet.account?.address],
  );

  const execute = useCallback(
    async (request: BridgeTestRequest): Promise<void> => {
      const address = wallet.account?.address;
      if (!address) {
        throw new Error('Connect a wallet before bridging.');
      }
      const userAddress = getAddress(address);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        ...INITIAL_STATE,
        status: 'quoting',
      });

      try {
        const quote = await buildFreshQuote(request, userAddress);
        const approvalNeeded = quote.approval
          ? await needsApproval({
              publicClient: getPublicClient(request.fromChainId),
              owner: userAddress,
              requirement: {
                tokenAddress: quote.approval.tokenAddress,
                spenderAddress: quote.approval.spenderAddress,
                amount: BigInt(quote.approval.amount),
              },
            })
          : false;

        await assertFundingAndEstimateGas({
          request,
          quote,
          userAddress,
          includeApproval: approvalNeeded,
        });

        if (wallet.chain?.id !== request.fromChainId) {
          await wallet.switchChain(request.fromChainId);
        }

        let hyperliquidBaseline: bigint | null = null;
        if (request.toChainId === HYPERCORE_CHAIN_ID) {
          hyperliquidBaseline = (
            await getPerpUsdcBalance({ user: userAddress })
          ).withdrawableUsd6;
        }

        if (approvalNeeded && quote.approval) {
          setState((current) => ({
            ...current,
            status: 'awaitingApproval',
            quote,
          }));
          const approvalTx = buildApproveTx({
            token: quote.approval.tokenAddress,
            spender: quote.approval.spenderAddress,
            amount: quote.approval.amount,
            chainId: request.fromChainId,
            intentType: 'BRIDGE_APPROVAL',
          });
          const approvalHash = await wallet.sendTransaction({
            to: approvalTx.to as Address,
            data: approvalTx.data as `0x${string}`,
            value: 0n,
            chainId: approvalTx.chainId,
          });
          const approvalReceipt = await getPublicClient(
            request.fromChainId,
          ).waitForTransactionReceipt({ hash: approvalHash });
          if (approvalReceipt.status !== 'success') {
            throw new Error('USDC approval transaction reverted.');
          }
          if (controller.signal.aborted) return;
        }

        setState((current) => ({
          ...current,
          status: 'awaitingBridgeSignature',
          quote,
        }));
        const sourceTxHash = await sendPreparedTransaction(
          wallet,
          quote.transaction,
        );
        const lifiScanUrl = `https://scan.li.fi/tx/${sourceTxHash}`;
        setState((current) => ({
          ...current,
          status: 'sourceSubmitted',
          sourceTxHash,
          lifiScanUrl,
        }));

        const sourceReceipt = await getPublicClient(
          request.fromChainId,
        ).waitForTransactionReceipt({ hash: sourceTxHash });
        if (sourceReceipt.status !== 'success') {
          throw new Error('Bridge source transaction reverted.');
        }
        if (controller.signal.aborted) return;

        setState((current) => ({ ...current, status: 'bridging' }));
        const bridgeStatus = await waitForBridgeCompletion({
          txHash: sourceTxHash,
          fromChain: request.fromChainId,
          toChain: request.toChainId,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const destinationTxHash = bridgeStatus.receiving?.txHash ?? null;

        if (
          request.toChainId === HYPERCORE_CHAIN_ID &&
          hyperliquidBaseline !== null
        ) {
          setState((current) => ({
            ...current,
            status: 'confirmingDestination',
            destinationTxHash,
          }));
          await waitForPerpUsdcArrival({
            user: userAddress,
            baselineUsd6: hyperliquidBaseline,
            expectedUsd6: BigInt(quote.estimate.toAmountMin),
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
        }

        setState((current) => ({
          ...current,
          status: 'completed',
          destinationTxHash,
          error: null,
        }));
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          status: 'failed',
          error: extractErrorMessage(error, 'Bridge failed'),
        }));
      }
    },
    [wallet],
  );

  const reset = useCallback(() => {
    quoteRequestId.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    prepare,
    execute,
    reset,
    pending: !['idle', 'ready', 'completed', 'failed'].includes(state.status),
  };
}

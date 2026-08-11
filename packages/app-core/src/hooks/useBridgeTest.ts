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
import { type BridgeQuote, HYPERCORE_CHAIN_ID } from '@zapengine/intent-engine';
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
  quote: BridgeQuote | null;
  sourceTxHash: Hash | null;
  destinationTxHash: Hash | null;
  error: string | null;
}

const INITIAL_STATE: BridgeTestState = {
  status: 'idle',
  quote: null,
  sourceTxHash: null,
  destinationTxHash: null,
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
): Promise<BridgeQuote> {
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
  quote: BridgeQuote;
  userAddress: Address;
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

  let totalGas = 0n;
  let totalValue = 0n;
  for (const tx of [...params.quote.approvals, ...params.quote.calls]) {
    totalGas += await publicClient.estimateGas({
      account: params.userAddress,
      to: tx.to as Address,
      data: tx.data as `0x${string}`,
      value: BigInt(tx.value),
    });
    totalValue += BigInt(tx.value);
  }

  const [nativeBalance, gasPrice] = await Promise.all([
    publicClient.getBalance({ address: params.userAddress }),
    publicClient.getGasPrice(),
  ]);
  if (nativeBalance < totalValue + totalGas * gasPrice) {
    throw new Error('ETH balance is too low to pay bridge and approval gas.');
  }
}

export function useBridgeTest() {
  const wallet = useWalletProvider();
  const [state, setState] = useState<BridgeTestState>(INITIAL_STATE);
  const quoteRequestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const prepare = useCallback(
    async (request: BridgeTestRequest): Promise<BridgeQuote | null> => {
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
      if (!address) throw new Error('Connect a wallet before bridging.');
      const userAddress = getAddress(address);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ ...INITIAL_STATE, status: 'quoting' });

      try {
        const quote = await buildFreshQuote(request, userAddress);
        if (controller.signal.aborted) return;
        await assertFundingAndEstimateGas({ request, quote, userAddress });
        if (controller.signal.aborted) return;

        if (wallet.chain?.id !== request.fromChainId) {
          await wallet.switchChain(request.fromChainId);
          if (controller.signal.aborted) return;
        }

        let hyperliquidBaseline: bigint | null = null;
        if (request.toChainId === HYPERCORE_CHAIN_ID) {
          hyperliquidBaseline = (
            await getPerpUsdcBalance({ user: userAddress })
          ).withdrawableUsd6;
          if (controller.signal.aborted) return;
        }

        if (quote.approvals.length > 0) {
          setState((current) => ({
            ...current,
            status: 'awaitingApproval',
            quote,
          }));
          for (const approvalTx of quote.approvals) {
            const approvalHash = await sendPreparedTransaction(
              wallet,
              approvalTx,
            );
            const approvalReceipt = await getPublicClient(
              request.fromChainId,
            ).waitForTransactionReceipt({ hash: approvalHash });
            if (approvalReceipt.status !== 'success') {
              throw new Error('Bridge approval transaction reverted.');
            }
            if (controller.signal.aborted) return;
          }
        }

        setState((current) => ({
          ...current,
          status: 'awaitingBridgeSignature',
          quote,
        }));
        let sourceTxHash: Hash | null = null;
        for (const call of quote.calls) {
          sourceTxHash = await sendPreparedTransaction(wallet, call);
          setState((current) => ({
            ...current,
            status: 'sourceSubmitted',
            sourceTxHash,
          }));
          const sourceReceipt = await getPublicClient(
            request.fromChainId,
          ).waitForTransactionReceipt({ hash: sourceTxHash });
          if (sourceReceipt.status !== 'success') {
            throw new Error('Bridge source transaction reverted.');
          }
          if (controller.signal.aborted) return;
        }
        if (!sourceTxHash)
          throw new Error('Bridge quote returned no source call.');

        setState((current) => ({ ...current, status: 'bridging' }));
        const settlement = await waitForBridgeCompletion({
          provider: quote.provider,
          txHash: sourceTxHash,
          fromChain: request.fromChainId,
          toChain: request.toChainId,
          quote,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const destinationTxHash = settlement.destinationTxHash ?? null;

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
            expectedUsd6: BigInt(quote.toAmountMin),
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

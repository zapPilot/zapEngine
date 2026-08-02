import { useQuery } from '@tanstack/react-query';
import { useBridgeTest } from '@zapengine/app-core/hooks/useBridgeTest';
import {
  getOnChainTokenBalance,
  NATIVE_TOKEN_ADDRESS,
} from '@zapengine/app-core/services';
import { ExternalLink } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Text, TextInput, View } from 'react-native';
import { formatUnits, parseUnits } from 'viem';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Tap } from '@/components/ui/Tap';
import {
  baseUnitsToUsdcInput,
  bridgeBalanceQueryKey,
  bridgeChain,
  bridgeDestinationChains,
  BRIDGE_SOURCE_CHAINS,
  normalizeUsdcInput,
  usdcInputToBaseUnits,
} from '@/integration/bridgeTestModel';
import { useAccount } from '@/integration/useAccount';

const STATUS_LABELS = {
  idle: 'Enter an amount to request a route.',
  quoting: 'Finding the best USDC route…',
  ready: 'Route ready',
  awaitingApproval: 'Confirm USDC approval in your wallet…',
  awaitingBridgeSignature: 'Confirm the bridge transaction…',
  sourceSubmitted: 'Source transaction submitted…',
  bridging: 'USDC is crossing chains…',
  confirmingDestination: 'Confirming Hyperliquid arrival…',
  completed: 'Bridge completed',
  failed: 'Bridge unavailable',
} as const;

function formatUsd(value: string): string {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? `$${number.toFixed(2)}` : '$0.00';
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function ChainPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Tap
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      className="min-h-11 flex-1 items-center justify-center rounded-xl border px-2"
      style={
        selected
          ? {
              backgroundColor: 'rgba(212,197,163,.14)',
              borderColor: 'rgba(212,197,163,.35)',
            }
          : { backgroundColor: '#171719', borderColor: '#2b2b2f' }
      }
      onPress={onPress}
    >
      <Text
        className={`text-center font-sans-semibold text-[11px] ${selected ? 'text-accent' : 'text-ink-dim'}`}
      >
        {label}
      </Text>
    </Tap>
  );
}

export function BridgeTestPanel() {
  const account = useAccount();
  const bridge = useBridgeTest();
  const { prepare, reset } = bridge;
  const [sourceChainId, setSourceChainId] = useState(8453);
  const [destinationChainId, setDestinationChainId] = useState(42161);
  const [amountInput, setAmountInput] = useState('');

  const source = bridgeChain(sourceChainId);
  const destination = bridgeChain(destinationChainId);
  const destinations = useMemo(
    () => bridgeDestinationChains(sourceChainId),
    [sourceChainId],
  );
  const sourceUsdcBalance = useQuery({
    queryKey: bridgeBalanceQueryKey({
      address: account.address,
      chainId: source.chainId,
      tokenAddress: source.usdcAddress,
      kind: 'token',
    }),
    queryFn: () =>
      getOnChainTokenBalance(
        source.chainId,
        source.usdcAddress,
        source.usdcDecimals,
        account.address!,
      ),
    enabled: Boolean(account.address),
    staleTime: 10_000,
  });
  const sourceEthBalance = useQuery({
    queryKey: bridgeBalanceQueryKey({
      address: account.address,
      chainId: source.chainId,
      tokenAddress: NATIVE_TOKEN_ADDRESS,
      kind: 'gas',
    }),
    queryFn: () =>
      getOnChainTokenBalance(
        source.chainId,
        NATIVE_TOKEN_ADDRESS,
        18,
        account.address!,
      ),
    enabled: Boolean(account.address),
    staleTime: 10_000,
  });
  const sourceBalanceBaseUnits = sourceUsdcBalance.data
    ? parseUnits(sourceUsdcBalance.data.balance, source.usdcDecimals).toString()
    : null;
  const amountBaseUnits = usdcInputToBaseUnits(amountInput);
  const exceedsBalance =
    sourceBalanceBaseUnits !== null &&
    BigInt(amountBaseUnits) > BigInt(sourceBalanceBaseUnits);
  const hasGas = sourceEthBalance.data
    ? parseUnits(sourceEthBalance.data.balance, 18) > 0n
    : false;
  const request = useMemo(
    () => ({
      fromChainId: source.chainId,
      toChainId: destination.chainId,
      fromToken: source.usdcAddress,
      toToken: destination.usdcAddress,
      fromAmount: amountBaseUnits,
    }),
    [amountBaseUnits, destination, source],
  );

  useEffect(() => {
    reset();
    if (
      !account.isConnected ||
      BigInt(amountBaseUnits) <= 0n ||
      sourceBalanceBaseUnits === null ||
      exceedsBalance ||
      sourceChainId === destinationChainId
    ) {
      return;
    }
    const timeout = setTimeout(() => {
      void prepare(request);
    }, 500);
    return () => clearTimeout(timeout);
  }, [
    account.isConnected,
    amountBaseUnits,
    destinationChainId,
    exceedsBalance,
    prepare,
    request,
    reset,
    sourceBalanceBaseUnits,
    sourceChainId,
  ]);

  function selectSource(chainId: number): void {
    setSourceChainId(chainId);
    if (chainId === destinationChainId) {
      const replacement = bridgeDestinationChains(chainId)[0];
      if (replacement) setDestinationChainId(replacement.chainId);
    }
  }

  const canExecute =
    account.isConnected &&
    bridge.status === 'ready' &&
    bridge.quote !== null &&
    BigInt(amountBaseUnits) > 0n &&
    !exceedsBalance &&
    sourceBalanceBaseUnits !== null &&
    !sourceUsdcBalance.isError &&
    !sourceEthBalance.isError &&
    hasGas;

  const primaryLabel = !account.isConnected
    ? account.isConnecting
      ? 'Connecting…'
      : 'Connect wallet'
    : bridge.pending
      ? STATUS_LABELS[bridge.status]
      : bridge.status === 'completed'
        ? 'Bridge another amount'
        : 'Start bridge test';

  function handlePrimaryAction(): void {
    if (!account.isConnected) {
      void account.connect();
      return;
    }
    if (bridge.status === 'completed') {
      setAmountInput('');
      bridge.reset();
      void Promise.all([
        sourceUsdcBalance.refetch(),
        sourceEthBalance.refetch(),
      ]);
      return;
    }
    if (canExecute) {
      void bridge
        .execute(request)
        .then(() =>
          Promise.all([
            sourceUsdcBalance.refetch(),
            sourceEthBalance.refetch(),
          ]),
        );
    }
  }

  return (
    <View className="mt-4 gap-4">
      <View className="rounded-[22px] border border-line bg-[#111113] p-4">
        <Text className="font-sans-semibold text-[15px] text-ink">From</Text>
        <View accessibilityRole="radiogroup" className="mt-2 flex-row gap-2">
          {BRIDGE_SOURCE_CHAINS.map((chain) => (
            <ChainPill
              key={chain.chainId}
              label={chain.label}
              selected={chain.chainId === sourceChainId}
              onPress={() => selectSource(chain.chainId)}
            />
          ))}
        </View>

        <Text className="mt-4 font-sans-semibold text-[15px] text-ink">To</Text>
        <View
          accessibilityRole="radiogroup"
          className="mt-2 flex-row flex-wrap gap-2"
        >
          {destinations.map((chain) => (
            <View key={chain.chainId} className="min-w-[30%] flex-1">
              <ChainPill
                label={chain.label}
                selected={chain.chainId === destinationChainId}
                onPress={() => setDestinationChainId(chain.chainId)}
              />
            </View>
          ))}
        </View>

        <View className="mt-5 flex-row items-center justify-between">
          <Text className="text-[11px] text-ink-dim">USDC amount</Text>
          <Tap
            accessibilityRole="button"
            className="min-h-8 justify-center"
            disabled={
              sourceBalanceBaseUnits === null ||
              sourceUsdcBalance.isLoading ||
              sourceUsdcBalance.isError
            }
            onPress={() =>
              setAmountInput(
                baseUnitsToUsdcInput(sourceBalanceBaseUnits ?? '0'),
              )
            }
          >
            <Text className="font-mono text-[10px] text-accent">
              Balance{' '}
              {sourceUsdcBalance.isLoading
                ? 'Loading…'
                : sourceUsdcBalance.isError
                  ? 'Unavailable'
                  : (sourceUsdcBalance.data?.balance ?? '0')}{' '}
              USDC · MAX
            </Text>
          </Tap>
        </View>
        <View className="mt-2 flex-row items-center rounded-[16px] border border-line bg-[#171719] px-4">
          <TextInput
            accessibilityLabel="USDC bridge amount"
            className="min-w-0 flex-1 py-4 font-sans-semibold text-[30px] text-ink"
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#52525b"
            selectionColor="#d4c5a3"
            value={amountInput}
            onChangeText={(value) => setAmountInput(normalizeUsdcInput(value))}
          />
          <Text className="font-sans-semibold text-[13px] text-ink-dim">
            USDC
          </Text>
        </View>

        {exceedsBalance ? (
          <Text className="mt-2 text-[11px] text-danger">
            This amount exceeds your {source.label} USDC balance.
          </Text>
        ) : sourceUsdcBalance.isError ? (
          <Text className="mt-2 text-[11px] text-danger">
            Unable to load {source.label} USDC balance.
          </Text>
        ) : !hasGas && account.isConnected && !sourceEthBalance.isLoading ? (
          <Text className="mt-2 text-[11px] text-danger">
            Add ETH on {source.label} to pay network gas.
          </Text>
        ) : null}
      </View>

      <View className="rounded-[22px] border border-line bg-[#111113] p-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-sans-semibold text-[15px] text-ink">Route</Text>
          <Text className="font-mono text-[10px] uppercase text-ink-dim">
            {bridge.quote?.estimate.tool ?? 'LI.FI'}
          </Text>
        </View>

        {bridge.quote ? (
          <View className="mt-3 gap-2">
            <View className="flex-row justify-between">
              <Text className="text-[11px] text-ink-dim">Expected</Text>
              <Text className="font-mono text-[11px] text-ink">
                {formatUnits(BigInt(bridge.quote.estimate.toAmount), 6)} USDC
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-[11px] text-ink-dim">Minimum</Text>
              <Text className="font-mono text-[11px] text-ink">
                {formatUnits(BigInt(bridge.quote.estimate.toAmountMin), 6)} USDC
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-[11px] text-ink-dim">Bridge fee</Text>
              <Text className="font-mono text-[11px] text-ink">
                {formatUsd(bridge.quote.estimate.feeCostUsd)}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-[11px] text-ink-dim">Network gas</Text>
              <Text className="font-mono text-[11px] text-ink">
                {formatUsd(bridge.quote.estimate.gasCostUsd)}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-[11px] text-ink-dim">Estimated time</Text>
              <Text className="font-mono text-[11px] text-ink">
                {formatDuration(bridge.quote.estimate.executionDuration)}
              </Text>
            </View>
          </View>
        ) : (
          <Text className="mt-3 text-[11px] leading-[17px] text-ink-dim">
            {bridge.error ?? STATUS_LABELS[bridge.status]}
          </Text>
        )}

        {bridge.error && bridge.quote ? (
          <Text className="mt-3 text-[11px] leading-[17px] text-danger">
            {bridge.error}
          </Text>
        ) : null}

        {bridge.lifiScanUrl ? (
          <Tap
            accessibilityRole="link"
            className="mt-3 min-h-11 flex-row items-center gap-2"
            onPress={() => void Linking.openURL(bridge.lifiScanUrl!)}
          >
            <ExternalLink size={14} color="#d4c5a3" />
            <Text className="text-[11px] text-accent underline">
              Track on LI.FI Scan
            </Text>
          </Tap>
        ) : null}
      </View>

      <PrimaryButton
        disabled={
          account.isConnecting ||
          (account.isConnected && bridge.status !== 'completed' && !canExecute)
        }
        onPress={handlePrimaryAction}
      >
        {primaryLabel}
      </PrimaryButton>
      <Text className="px-2 text-center text-[10px] leading-[15px] text-ink-faint">
        Test-only flow. It bridges canonical USDC and does not deposit into a
        strategy or HLP vault.
      </Text>
    </View>
  );
}

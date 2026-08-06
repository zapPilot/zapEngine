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

import { QuickAmountChips } from '@/components/invest/QuickAmountChips';
import { SwapArrowDivider } from '@/components/invest/SwapArrowDivider';
import { TokenSelectorPill } from '@/components/invest/TokenSelectorPill';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Tap } from '@/components/ui/Tap';
import {
  baseUnitsToUsdcInput,
  bridgeBalanceQueryKey,
  bridgeChain,
  type BridgeChainOption,
  bridgeDestinationChains,
  BRIDGE_SOURCE_CHAINS,
  normalizeUsdcInput,
  percentOfBaseUnits,
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

function ChainPillRow({
  options,
  selectedChainId,
  onSelect,
  wrap = false,
  accessibilityLabel,
}: {
  options: readonly BridgeChainOption[];
  selectedChainId: number;
  onSelect: (chainId: number) => void;
  wrap?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radiogroup"
      className={wrap ? 'mt-2 flex-row flex-wrap gap-2' : 'mt-2 flex-row gap-2'}
    >
      {options.map((chain) =>
        wrap ? (
          <View key={chain.chainId} className="min-w-[30%] flex-1">
            <ChainPill
              label={chain.label}
              selected={chain.chainId === selectedChainId}
              onPress={() => onSelect(chain.chainId)}
            />
          </View>
        ) : (
          <ChainPill
            key={chain.chainId}
            label={chain.label}
            selected={chain.chainId === selectedChainId}
            onPress={() => onSelect(chain.chainId)}
          />
        ),
      )}
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-[11px] text-ink-dim">{label}</Text>
      <Text className="font-mono text-[11px] text-ink">{value}</Text>
    </View>
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

  const canSwap = destination.canSource && source.canDestination;

  function swapDirection(): void {
    if (!canSwap) return;
    setSourceChainId(destinationChainId);
    setDestinationChainId(sourceChainId);
  }

  const quickAmountsDisabled =
    sourceBalanceBaseUnits === null ||
    sourceUsdcBalance.isLoading ||
    sourceUsdcBalance.isError;

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
    <View className="mt-4">
      <View className="rounded-[22px] border border-line bg-[#111113] p-4">
        <Text className="text-[11px] text-ink-dim">From</Text>
        <ChainPillRow
          options={BRIDGE_SOURCE_CHAINS}
          selectedChainId={sourceChainId}
          onSelect={selectSource}
          accessibilityLabel="Source chain"
        />

        <View className="mt-4 flex-row items-center justify-between gap-3">
          <TextInput
            accessibilityLabel="USDC bridge amount"
            className="min-w-0 flex-1 font-sans-semibold text-[34px] leading-[40px] text-ink"
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#52525b"
            selectionColor="#d4c5a3"
            value={amountInput}
            onChangeText={(value) => setAmountInput(normalizeUsdcInput(value))}
          />
          <TokenSelectorPill
            symbol="USDC"
            glyph="$"
            iconBg="#2775ca"
            accessibilityLabel="Bridge token USDC"
          />
        </View>
        <View className="mt-2 flex-row items-center justify-between">
          <Text className="font-mono text-[10px] text-ink-dim">
            ≈ {formatUsd(amountInput)}
          </Text>
          <Text className="font-mono text-[10px] text-ink-dim">
            Balance:{' '}
            {sourceUsdcBalance.isLoading
              ? 'Loading…'
              : sourceUsdcBalance.isError
                ? 'Unavailable'
                : `${sourceUsdcBalance.data?.balance ?? '0'} USDC`}
          </Text>
        </View>
        <QuickAmountChips
          disabled={quickAmountsDisabled}
          maxAccessibilityLabel={`Use maximum ${source.label} USDC balance`}
          onSelect={(bps) =>
            setAmountInput(
              baseUnitsToUsdcInput(
                percentOfBaseUnits(sourceBalanceBaseUnits, bps),
              ),
            )
          }
        />

        {exceedsBalance ? (
          <Text className="mt-2 text-[11px] text-error">
            This amount exceeds your {source.label} USDC balance.
          </Text>
        ) : sourceUsdcBalance.isError ? (
          <Text className="mt-2 text-[11px] text-error">
            Unable to load {source.label} USDC balance.
          </Text>
        ) : !hasGas && account.isConnected && !sourceEthBalance.isLoading ? (
          <Text className="mt-2 text-[11px] text-error">
            Add ETH on {source.label} to pay network gas.
          </Text>
        ) : null}
      </View>

      <SwapArrowDivider
        onPress={swapDirection}
        disabled={!canSwap}
        accessibilityLabel="Swap source and destination chains"
      />

      <View className="rounded-[22px] border border-line bg-[#111113] p-4">
        <Text className="text-[11px] text-ink-dim">To</Text>
        <ChainPillRow
          wrap
          options={destinations}
          selectedChainId={destinationChainId}
          onSelect={setDestinationChainId}
          accessibilityLabel="Destination chain"
        />

        <View className="mt-4 flex-row items-center justify-between gap-3">
          <Text
            className={`min-w-0 flex-1 font-sans-semibold text-[34px] leading-[40px] ${
              bridge.quote ? 'text-ink' : 'text-ink-faint'
            }`}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {bridge.quote
              ? formatUnits(BigInt(bridge.quote.estimate.toAmount), 6)
              : '0'}
          </Text>
          <TokenSelectorPill
            symbol="USDC"
            glyph="$"
            iconBg="#2775ca"
            accessibilityLabel={`Receive USDC on ${destination.label}`}
          />
        </View>
      </View>

      <View className="mt-3 rounded-[18px] border border-line bg-[#111113] px-4 py-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-[11px] text-ink-dim">Route</Text>
          <Text className="font-mono text-[10px] uppercase text-ink-dim">
            {bridge.quote?.estimate.tool ?? 'LI.FI'}
          </Text>
        </View>

        {bridge.quote ? (
          <View className="mt-2 gap-1.5">
            <SummaryRow
              label="Expected"
              value={`${formatUnits(BigInt(bridge.quote.estimate.toAmount), 6)} USDC`}
            />
            <SummaryRow
              label="Minimum"
              value={`${formatUnits(BigInt(bridge.quote.estimate.toAmountMin), 6)} USDC`}
            />
            <SummaryRow
              label="Bridge fee"
              value={formatUsd(bridge.quote.estimate.feeCostUsd)}
            />
            <SummaryRow
              label="Network gas"
              value={formatUsd(bridge.quote.estimate.gasCostUsd)}
            />
            <SummaryRow
              label="Estimated time"
              value={formatDuration(bridge.quote.estimate.executionDuration)}
            />
          </View>
        ) : (
          <Text className="mt-2 text-[11px] leading-[17px] text-ink-dim">
            {bridge.error ?? STATUS_LABELS[bridge.status]}
          </Text>
        )}

        {bridge.error && bridge.quote ? (
          <Text className="mt-2 text-[11px] leading-[17px] text-error">
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
        className="mt-4"
        disabled={
          account.isConnecting ||
          (account.isConnected && bridge.status !== 'completed' && !canExecute)
        }
        onPress={handlePrimaryAction}
      >
        {primaryLabel}
      </PrimaryButton>
      <Text className="mt-3 px-2 text-center text-[10px] leading-[15px] text-ink-faint">
        Test-only flow. It bridges canonical USDC and does not deposit into a
        strategy or HLP vault.
      </Text>
    </View>
  );
}

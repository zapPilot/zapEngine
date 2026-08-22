import {
  CHAIN_BRAND,
  PROTOCOL_BRAND,
  protocolBrandKeyFor,
} from '@zapengine/brand-assets';
import { getExplorerTxUrl } from '@zapengine/app-core/config/chains/display';
import * as Clipboard from 'expo-clipboard';
import { Copy, ExternalLink } from 'lucide-react-native';
import { Linking, Text, View } from 'react-native';

import { ChainMark } from '@/components/token/ChainMark';
import { ProtocolIcon } from '@/components/token/ProtocolIcon';
import { TokenIcon } from '@/components/token/TokenIcon';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Tap } from '@/components/ui/Tap';
import type { ActivityEvent } from '@/data/demo';
import { cn } from '@/lib/cn';

function relativeTimeLabel(value: string): string {
  if (value === 'now' || value === '—') return value;
  const match = /^(\d+)(m|h|d|w|mo|y)$/.exec(value);
  if (!match) return value;
  const count = Number(match[1]);
  const unit = match[2];
  const label =
    unit === 'm'
      ? 'minute'
      : unit === 'h'
        ? 'hour'
        : unit === 'd'
          ? 'day'
          : unit === 'w'
            ? 'week'
            : unit === 'mo'
              ? 'month'
              : 'year';
  return `${count} ${label}${count === 1 ? '' : 's'} ago`;
}

function compactTimeLabel(value: string): string {
  return value === 'now' || value === '—' ? value : `${value} ago`;
}

function actionLabel(event: ActivityEvent): string {
  return event.title;
}

function protocolLabel(protocol: string | undefined): string | undefined {
  if (!protocol) return undefined;
  const key = protocolBrandKeyFor(protocol);
  return key ? PROTOCOL_BRAND[key].label : protocol;
}

function compactHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function flowLabels(event: ActivityEvent): string[] {
  if (event.flowLabels && event.flowLabels.length > 0) {
    return event.flowLabels.slice(0, 2);
  }
  const labels = (event.categoryDeltas ?? []).flatMap((delta) =>
    delta.label.split(' · '),
  );
  if (labels.length > 0) return labels.slice(0, 2);
  return event.amountLabel ? [event.amountLabel] : [];
}

function flowTone(label: string): string {
  if (label.startsWith('+')) return 'text-success';
  if (label.startsWith('−') || label.startsWith('-')) return 'text-ink';
  return 'text-ink-dim';
}

function explorerUrl(event: ActivityEvent): string | null {
  if (!event.chain || !event.txHash) return null;
  return getExplorerTxUrl(CHAIN_BRAND[event.chain].chainId, event.txHash);
}

export function ActivityRow({
  event,
  failedLabel,
}: {
  event: ActivityEvent;
  failedLabel: string;
}) {
  const txUrl = explorerUrl(event);
  const chainLabel = event.chain ? CHAIN_BRAND[event.chain].label : event.meta;
  const flows = flowLabels(event);
  const venue =
    protocolLabel(event.protocol) ??
    (event.kind === 'contract-interaction'
      ? 'Contract interaction'
      : undefined);
  const walletContext = event.walletTransfer
    ? `${event.walletTransfer.from.label} → ${event.walletTransfer.to.label}`
    : event.wallet?.label;
  const contextLabel = [walletContext, venue].filter(Boolean).join(' · ');
  const hashLabel = event.txHash ? compactHash(event.txHash) : undefined;
  const accessibilityLabel = [
    actionLabel(event),
    walletContext,
    venue,
    ...flows,
    event.status === 'Failed' ? failedLabel : undefined,
    chainLabel,
    relativeTimeLabel(event.time),
  ]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return (
    <Card className="mb-2 rounded-2xl px-3.5 py-3">
      <View>
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 font-mono text-[10.5px] text-ink-faint">
            {compactTimeLabel(event.time)}
          </Text>
          <View className="flex-row items-center gap-1.5">
            {event.chain ? (
              <ChainMark chainKey={event.chain} size={13} />
            ) : null}
            <Text className="font-sans-medium text-[11px] text-ink-dim">
              {chainLabel}
            </Text>
            {event.txHash && txUrl ? (
              <Tap
                className="flex-row items-center gap-1"
                hitSlop={12}
                accessibilityRole="link"
                accessibilityLabel={`Open transaction ${hashLabel} in explorer`}
                onPress={() => void Linking.openURL(txUrl)}
              >
                <Text className="font-mono text-[10.5px] text-ink-faint underline">
                  {hashLabel}
                </Text>
                <ExternalLink size={11} strokeWidth={1.8} color="#a1a1aa" />
              </Tap>
            ) : event.txHash ? (
              <Text className="font-mono text-[10.5px] text-ink-faint">
                {hashLabel}
              </Text>
            ) : null}
            {event.txHash ? (
              <Tap
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Copy transaction hash ${hashLabel}`}
                onPress={() => void Clipboard.setStringAsync(event.txHash!)}
              >
                <Copy size={11} strokeWidth={1.8} color="#a1a1aa" />
              </Tap>
            ) : null}
          </View>
        </View>

        <View
          accessible
          accessibilityLabel={accessibilityLabel}
          className="mt-3 flex-row items-center gap-2.5"
        >
          {event.protocol || event.kind === 'contract-interaction' ? (
            <ProtocolIcon protocol={event.protocol ?? 'Contract'} size={36} />
          ) : event.tokenSymbol ? (
            <TokenIcon symbol={event.tokenSymbol} size={36} />
          ) : (
            <ProtocolIcon protocol="Contract" size={36} />
          )}
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-2">
              <Text
                className="min-w-0 flex-1 font-sans-semibold text-[14px] text-ink"
                numberOfLines={1}
              >
                {actionLabel(event)}
              </Text>
              {event.status === 'Failed' ? (
                <Pill className="border border-[rgba(255,111,97,.35)] bg-[rgba(255,111,97,.10)] px-2 py-[2px]">
                  <Text className="font-mono text-[9px] uppercase tracking-[0.8px] text-error">
                    {failedLabel}
                  </Text>
                </Pill>
              ) : null}
            </View>
            {contextLabel ? (
              <Text
                className="mt-0.5 font-sans text-[11.5px] text-ink-dim"
                numberOfLines={1}
              >
                {contextLabel}
              </Text>
            ) : null}
          </View>
          {flows.length > 0 ? (
            <View className="shrink-0 items-end pl-1.5">
              {flows.map((label, index) => (
                <Text
                  key={`${label}-${index}`}
                  className={cn(
                    'font-mono-medium text-[12px]',
                    index > 0 ? 'mt-0.5' : '',
                    flowTone(label),
                  )}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        {event.gasFeeLabel ? (
          <View className="mt-3 border-t border-line pt-2">
            <Text className="font-sans text-[10.5px] text-ink-faint">
              Gas: {event.gasFeeLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

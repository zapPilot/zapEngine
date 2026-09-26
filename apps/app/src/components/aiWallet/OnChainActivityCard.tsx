import { tokens } from '@zapengine/design-tokens/tokens';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ExternalLink,
  KeyRound,
  type LucideIcon,
} from 'lucide-react-native';
import { Linking, Text, View } from 'react-native';

import {
  CardHeading,
  ExplorerLink,
} from '@/components/aiWallet/AiWalletPrimitives';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import { BASESCAN_URL } from '@/config/aiWalletDemo';
import {
  basescanTxUrl,
  formatRelativeTime,
  type AgentTransaction,
  type AgentTransactionKind,
  type AgentTransactionStatus,
} from '@/integration/agentActivity';

interface OnChainActivityCardProps {
  agentAddress: string;
  configured: boolean;
  transactions: readonly AgentTransaction[] | undefined;
  loading: boolean;
  failed: boolean;
  nowMs: number;
}

const VISIBLE_TRANSACTION_LIMIT = 8;

const KIND_ICONS: Readonly<Record<AgentTransactionKind, LucideIcon>> = {
  approve: KeyRound,
  deposit: ArrowDownToLine,
  other: ArrowRightLeft,
};

const STATUS_STYLES: Readonly<
  Record<AgentTransactionStatus, { label: string; color: string }>
> = {
  ok: { label: 'Confirmed', color: tokens.color.success },
  error: { label: 'Failed', color: tokens.color.error },
  pending: { label: 'Pending', color: tokens.color.warning },
};

export function OnChainActivityCard(props: OnChainActivityCardProps) {
  return (
    <Card className="p-5">
      <CardHeading
        eyebrow="On-chain activity"
        title="Agent wallet transactions"
        right={
          <Pill className="border border-line bg-[rgba(255,255,255,.04)]">
            <Text className="font-mono text-[9.5px] text-ink-dim">
              Blockscout · 10s
            </Text>
          </Pill>
        }
      />
      <View className="mt-3">
        <ActivityBody {...props} />
      </View>
    </Card>
  );
}

function ActivityBody({
  agentAddress,
  configured,
  transactions,
  loading,
  failed,
  nowMs,
}: OnChainActivityCardProps) {
  if (!configured) {
    return <EmptyNote text="The agent wallet has not been deployed yet." />;
  }
  if (transactions === undefined) {
    if (loading) {
      return (
        <View className="gap-3 pt-2">
          <SkeletonBlock className="h-11 w-full rounded-xl" />
          <SkeletonBlock className="h-11 w-full rounded-xl" />
        </View>
      );
    }
    return (
      <EmptyNote
        text={
          failed
            ? 'Blockscout is unreachable right now. Retrying.'
            : 'No transactions yet.'
        }
      />
    );
  }
  if (transactions.length === 0) {
    return <EmptyNote text="No transactions yet. The agent is standing by." />;
  }
  const hiddenCount = transactions.length - VISIBLE_TRANSACTION_LIMIT;
  return (
    <View>
      {transactions.slice(0, VISIBLE_TRANSACTION_LIMIT).map((transaction) => (
        <ActivityRow
          key={transaction.hash}
          transaction={transaction}
          nowMs={nowMs}
        />
      ))}
      {hiddenCount > 0 ? (
        <View className="flex-row flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <Text className="text-[11.5px] text-ink-faint">
            {hiddenCount} older transaction{hiddenCount === 1 ? '' : 's'}
          </Text>
          <ExplorerLink
            url={`${BASESCAN_URL}/address/${agentAddress}`}
            label="View all on Basescan"
            accessibilityLabel="View all agent transactions on Basescan"
          />
        </View>
      ) : null}
    </View>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <Text className="py-3 text-[12.5px] leading-[19px] text-ink-dim">
      {text}
    </Text>
  );
}

function ActivityRow({
  transaction,
  nowMs,
}: {
  transaction: AgentTransaction;
  nowMs: number;
}) {
  const Icon = KIND_ICONS[transaction.kind];
  const status = STATUS_STYLES[transaction.status];
  const highlight = transaction.kind !== 'other';
  const when =
    transaction.timestampMs === null
      ? 'awaiting block'
      : formatRelativeTime(transaction.timestampMs, nowMs);

  return (
    <View className="flex-row items-center gap-3 border-t border-line py-3">
      <View
        className="h-9 w-9 items-center justify-center rounded-full border"
        style={{
          borderColor: highlight ? 'rgba(212,197,163,.35)' : tokens.color.line,
          backgroundColor: highlight
            ? 'rgba(212,197,163,.08)'
            : 'rgba(255,255,255,.03)',
        }}
      >
        <Icon
          size={15}
          color={highlight ? tokens.color.accent : tokens.color['ink-dim']}
          strokeWidth={1.8}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text
          className="font-sans-semibold text-[13px] text-ink"
          numberOfLines={1}
        >
          {transaction.label}
        </Text>
        <View className="mt-1 flex-row items-center gap-1.5">
          <View
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: status.color }}
          />
          <Text className="text-[11px]" style={{ color: status.color }}>
            {status.label}
          </Text>
          <Text className="text-[11px] text-ink-faint">· {when}</Text>
        </View>
      </View>
      <Tap
        accessibilityRole="link"
        accessibilityLabel={`View ${transaction.label} on Basescan`}
        className="h-9 w-9 items-center justify-center rounded-xl border border-line-hi bg-bg"
        onPress={() =>
          void Linking.openURL(basescanTxUrl(BASESCAN_URL, transaction.hash))
        }
      >
        <ExternalLink size={14} color={tokens.color.accent} />
      </Tap>
    </View>
  );
}

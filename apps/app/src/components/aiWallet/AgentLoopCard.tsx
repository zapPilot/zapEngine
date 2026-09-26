import { tokens } from '@zapengine/design-tokens/tokens';
import { Play } from 'lucide-react-native';
import { Text, View } from 'react-native';

import {
  CardHeading,
  ExplorerLink,
  StatusBadge,
} from '@/components/aiWallet/AiWalletPrimitives';
import { PulseDot } from '@/components/aiWallet/PulseDot';
import { ProgressTimelineRow } from '@/components/invest/ProgressTimelineRow';
import { Card } from '@/components/ui/Card';
import { Tap } from '@/components/ui/Tap';
import { BASESCAN_URL } from '@/config/aiWalletDemo';
import {
  basescanTxUrl,
  formatRelativeTime,
  type AgentTransaction,
} from '@/integration/agentActivity';
import {
  agentLoopBadge,
  agentLoopStepTone,
  AWAITING_FIRST_ACTION_DETAIL,
  type AgentLoopPlayback,
  type AgentLoopStep,
} from '@/integration/agentLoopModel';
import { cn } from '@/lib/cn';
import { truncateAddress } from '@/lib/format';

interface AgentLoopCardProps {
  steps: readonly AgentLoopStep[];
  playback: AgentLoopPlayback | null;
  latestDeposit: AgentTransaction | null;
  nowMs: number;
  onReplay: () => void;
}

export function AgentLoopCard({
  steps,
  playback,
  latestDeposit,
  nowMs,
  onReplay,
}: AgentLoopCardProps) {
  const hasDeposit = latestDeposit !== null;
  const badge = agentLoopBadge(playback);
  const replayDisabled = !hasDeposit || playback !== null;

  return (
    <Card className="p-5">
      <CardHeading
        eyebrow="Agent loop"
        title="From headline to receipt"
        right={
          <View className="flex-row items-center gap-2">
            {badge ? (
              <StatusBadge tone={badge === 'Live' ? 'live' : 'replay'}>
                {badge}
              </StatusBadge>
            ) : null}
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Replay last run"
              accessibilityState={{ disabled: replayDisabled }}
              disabled={replayDisabled}
              onPress={onReplay}
              className={cn(
                'min-h-9 flex-row items-center gap-1.5 rounded-xl border border-[rgba(212,197,163,.35)] bg-[rgba(212,197,163,.08)] px-3',
                replayDisabled && 'opacity-40',
              )}
            >
              <Play
                size={12}
                color={tokens.color.accent}
                fill={tokens.color.accent}
              />
              <Text className="font-sans-semibold text-[12px] text-accent">
                Replay last run
              </Text>
            </Tap>
          </View>
        }
      />

      <View className="mt-5">
        {steps.map((step, index) => {
          const tone = agentLoopStepTone(index, playback, hasDeposit);
          const isConfirm = step.id === 'confirm';
          return (
            <ProgressTimelineRow
              key={step.id}
              label={step.label}
              detail={
                isConfirm && !hasDeposit
                  ? AWAITING_FIRST_ACTION_DETAIL
                  : step.detail
              }
              tone={tone}
              isLast={index === steps.length - 1}
              {...(tone === 'active'
                ? { icon: <PulseDot color={tokens.color.accent} size={7} /> }
                : {})}
            >
              {isConfirm && latestDeposit && tone !== 'waiting' ? (
                <ConfirmedDepositProof deposit={latestDeposit} nowMs={nowMs} />
              ) : null}
            </ProgressTimelineRow>
          );
        })}
      </View>
    </Card>
  );
}

function ConfirmedDepositProof({
  deposit,
  nowMs,
}: {
  deposit: AgentTransaction;
  nowMs: number;
}) {
  return (
    <View className="mt-2 flex-row flex-wrap items-center gap-2">
      <Text className="font-mono text-[10.5px] text-accent">
        {truncateAddress(deposit.hash, 10, 6)}
        {deposit.timestampMs === null
          ? ''
          : ` · ${formatRelativeTime(deposit.timestampMs, nowMs)}`}
      </Text>
      <ExplorerLink
        url={basescanTxUrl(BASESCAN_URL, deposit.hash)}
        label="Basescan"
        accessibilityLabel="View the confirmed deposit on Basescan"
      />
    </View>
  );
}

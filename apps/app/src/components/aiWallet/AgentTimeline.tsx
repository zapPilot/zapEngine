import { tokens } from '@zapengine/design-tokens/tokens';
import {
  ChartNoAxesColumnIncreasing,
  Check,
  ExternalLink,
  FileText,
  Layers,
  Sparkle,
  SquarePlay,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';

import { BASE_BLUE_BRIGHT } from '@/components/aiWallet/aiWalletTheme';
import { PulseDot } from '@/components/aiWallet/PulseDot';
import { ChainMark } from '@/components/token/ChainMark';
import { Tap } from '@/components/ui/Tap';
import { BASESCAN_URL } from '@/config/aiWalletDemo';
import {
  basescanTxUrl,
  formatClockTime,
  type AgentTransaction,
} from '@/integration/agentActivity';
import {
  AGENT_LOOP_STEPS,
  agentLoopStepTone,
  AWAITING_FIRST_ACTION_DETAIL,
  type AgentLoopPlayback,
  type AgentLoopStepId,
  type AgentLoopStepTone,
} from '@/integration/agentLoopModel';
import { cn } from '@/lib/cn';

interface AgentTimelineProps {
  playback: AgentLoopPlayback | null;
  latestDeposit: AgentTransaction | null;
  /** Known to have no deposit yet, as opposed to still loading. */
  awaitingFirstAction: boolean;
  /** Wide layout: rows share the height of the wallet card beside it. */
  stretch: boolean;
}

const ICON_SIZE = 18;
const LINE_IDLE = tokens.color.line;

const STEP_ICONS: Readonly<Record<AgentLoopStepId, LucideIcon | null>> = {
  news: FileText,
  analyze: ChartNoAxesColumnIncreasing,
  intent: Sparkle,
  compose: Layers,
  sign: Wallet,
  confirm: null,
  deliver: SquarePlay,
};

export function AgentTimeline({
  playback,
  latestDeposit,
  awaitingFirstAction,
  stretch,
}: AgentTimelineProps) {
  const hasDeposit = latestDeposit !== null;
  const tones = AGENT_LOOP_STEPS.map((_, index) =>
    agentLoopStepTone(index, playback, hasDeposit),
  );

  return (
    <View className={cn(stretch && 'flex-1')}>
      <View className={cn(stretch && 'flex-1')}>
        {AGENT_LOOP_STEPS.map((step, index) => {
          const tone = tones[index] ?? 'waiting';
          const previous = tones[index - 1];
          const next = tones[index + 1];
          const isFinal = index === AGENT_LOOP_STEPS.length - 1;
          const deposit = step.id === 'confirm' ? latestDeposit : null;
          return (
            <TimelineRow
              key={step.id}
              stretch={stretch}
              deposit={deposit}
              rail={
                <>
                  <Connector
                    visible={previous !== undefined}
                    lit={tone !== 'waiting'}
                  />
                  <StepRing
                    number={index + 1}
                    tone={tone}
                    final={isFinal && tone === 'done'}
                  />
                  <Connector
                    visible={next !== undefined}
                    lit={next !== undefined && next !== 'waiting'}
                  />
                </>
              }
            >
              <StepIcon stepId={step.id} tone={tone} final={isFinal} />
              <Text
                className={cn(
                  'min-w-0 flex-1 text-[15px] leading-5',
                  isFinal && tone === 'done'
                    ? 'font-sans-bold text-ink'
                    : 'font-sans-medium',
                  tone === 'waiting' ? 'text-ink-faint' : 'text-ink',
                )}
                numberOfLines={2}
              >
                {step.label}
              </Text>
              {deposit !== null &&
              deposit.timestampMs !== null &&
              tone !== 'waiting' ? (
                <View className="flex-row items-center gap-1.5">
                  <Text className="font-mono text-[12.5px] text-ink-dim">
                    {formatClockTime(deposit.timestampMs)}
                  </Text>
                  <ExternalLink size={12} color={tokens.color['ink-faint']} />
                </View>
              ) : null}
            </TimelineRow>
          );
        })}
      </View>
      {awaitingFirstAction ? (
        <Text className="mt-3 pl-14 text-[12.5px] leading-[18px] text-ink-faint">
          {AWAITING_FIRST_ACTION_DETAIL}
        </Text>
      ) : null}
    </View>
  );
}

function TimelineRow({
  stretch,
  deposit,
  rail,
  children,
}: {
  stretch: boolean;
  deposit: AgentTransaction | null;
  rail: ReactNode;
  children: ReactNode;
}) {
  const className = cn('min-h-[52px] flex-row', stretch && 'flex-1');
  const content = (
    <>
      <View className="w-10 items-center">{rail}</View>
      <View className="ml-3 min-w-0 flex-1 flex-row items-center gap-3 py-2">
        {children}
      </View>
    </>
  );
  if (deposit === null) {
    return <View className={className}>{content}</View>;
  }
  return (
    <Tap
      accessibilityRole="link"
      accessibilityLabel="View the confirmed deposit on Basescan"
      className={className}
      onPress={() =>
        void Linking.openURL(basescanTxUrl(BASESCAN_URL, deposit.hash))
      }
    >
      {content}
    </Tap>
  );
}

function Connector({ visible, lit }: { visible: boolean; lit: boolean }) {
  return (
    <View
      className="w-[2px] flex-1"
      style={{
        backgroundColor: !visible
          ? 'transparent'
          : lit
            ? BASE_BLUE_BRIGHT
            : LINE_IDLE,
      }}
    />
  );
}

function StepRing({
  number,
  tone,
  final,
}: {
  number: number;
  tone: AgentLoopStepTone;
  final: boolean;
}) {
  if (final) {
    return (
      <View className="h-10 w-10 items-center justify-center rounded-full border-2 border-success bg-[rgba(122,216,143,.12)]">
        <Check size={18} color={tokens.color.success} strokeWidth={2.6} />
      </View>
    );
  }
  if (tone === 'waiting') {
    return (
      <View className="h-8 w-8 items-center justify-center rounded-full border-2 border-line-hi">
        <Text className="font-mono-medium text-[12px] text-ink-faint">
          {number}
        </Text>
      </View>
    );
  }
  return (
    <View
      className="h-8 w-8 items-center justify-center rounded-full border-2 bg-[rgba(0,82,255,.14)]"
      style={{ borderColor: BASE_BLUE_BRIGHT }}
    >
      {tone === 'active' ? (
        <PulseDot color={BASE_BLUE_BRIGHT} size={7} />
      ) : (
        <Text className="font-mono-semibold text-[12px] text-[#a9c4ff]">
          {number}
        </Text>
      )}
    </View>
  );
}

function StepIcon({
  stepId,
  tone,
  final,
}: {
  stepId: AgentLoopStepId;
  tone: AgentLoopStepTone;
  final: boolean;
}) {
  const Icon = STEP_ICONS[stepId];
  if (Icon === null) {
    return (
      <View className={cn(tone === 'waiting' && 'opacity-40')}>
        <ChainMark chainKey="base" size={ICON_SIZE} />
      </View>
    );
  }
  const color =
    tone === 'waiting'
      ? tokens.color['ink-faint']
      : final && tone === 'done'
        ? tokens.color.success
        : BASE_BLUE_BRIGHT;
  return <Icon size={ICON_SIZE} color={color} strokeWidth={1.8} />;
}

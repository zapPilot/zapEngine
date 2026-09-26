import { tokens } from '@zapengine/design-tokens/tokens';
import type { AgentRunLink, AgentRunStatus } from '@zapengine/types/api';
import {
  ChartNoAxesColumnIncreasing,
  Check,
  ExternalLink,
  FileText,
  Layers,
  Sparkle,
  SquarePlay,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Fragment, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';

import { BASE_BLUE_BRIGHT } from '@/components/aiWallet/aiWalletTheme';
import { PulseDot } from '@/components/aiWallet/PulseDot';
import { ChainMark } from '@/components/token/ChainMark';
import { DisclosureChevron } from '@/components/ui/Disclosure';
import { Tap } from '@/components/ui/Tap';
import { BASESCAN_URL } from '@/config/aiWalletDemo';
import {
  basescanTxUrl,
  formatClockTime,
  type AgentTransaction,
} from '@/integration/agentActivity';
import {
  AGENT_LOOP_STEPS,
  AWAITING_FIRST_ACTION_DETAIL,
  stepLiveLine,
  timelineTones,
  type AgentLoopPlayback,
  type AgentLoopStepId,
  type AgentLoopStepTone,
} from '@/integration/agentLoopModel';
import { cn } from '@/lib/cn';

interface AgentTimelineProps {
  /** The local agent's run; `null` outside local dev or when it is not serving. */
  run: AgentRunStatus | null;
  playback: AgentLoopPlayback | null;
  latestDeposit: AgentTransaction | null;
  /** Known to have no deposit yet, as opposed to still loading. */
  awaitingFirstAction: boolean;
  /** Wide layout: rows share the height of the wallet card beside it. */
  stretch: boolean;
}

interface ConfirmLink {
  hash: string;
  timestampMs: number | null;
  label: string;
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
  run,
  playback,
  latestDeposit,
  awaitingFirstAction,
  stretch,
}: AgentTimelineProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<AgentLoopStepId>>(
    () => new Set(),
  );
  const { tones, source } = timelineTones({
    run,
    playback,
    hasDeposit: latestDeposit !== null,
  });
  // Live lines, spinners and the run's deposit belong to the run on screen;
  // its entries stay readable underneath a replay.
  const liveRun = source === 'run' ? run : null;
  const history = run !== null && run.state !== 'idle' ? run : null;
  const confirmLink = confirmLinkFor(liveRun, latestDeposit);

  const toggle = (stepId: AgentLoopStepId) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });

  return (
    <View className={cn(stretch && 'flex-1')}>
      <View className={cn(stretch && 'flex-1')}>
        {AGENT_LOOP_STEPS.map((step, index) => {
          const tone = tones[index] ?? 'waiting';
          const next = tones[index + 1];
          const isFinal = index === AGENT_LOOP_STEPS.length - 1;
          const open = expanded.has(step.id);
          const liveLine =
            liveRun === null ? null : stepLiveLine(liveRun, step.id);
          const nextLit = next !== undefined && next !== 'waiting';
          return (
            <Fragment key={step.id}>
              {/* `grow`, not `flex-1`: a zero basis would let a row shrink
                  under an open panel and draw it over the next row. */}
              <View className={cn('min-h-[52px] flex-row', stretch && 'grow')}>
                <View className="w-10 items-center">
                  <Connector visible={index > 0} lit={tone !== 'waiting'} />
                  <StepRing
                    number={index + 1}
                    tone={tone}
                    final={isFinal && tone === 'done'}
                    spinner={liveRun !== null}
                  />
                  <Connector visible={next !== undefined} lit={nextLit} />
                </View>
                <Tap
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  aria-expanded={open}
                  onPress={() => toggle(step.id)}
                  className="ml-3 min-w-0 flex-1 flex-row items-center gap-3 py-2"
                >
                  <StepIcon stepId={step.id} tone={tone} final={isFinal} />
                  <View className="min-w-0 flex-1">
                    <Text
                      className={cn(
                        'text-[15px] leading-5',
                        isFinal && tone === 'done'
                          ? 'font-sans-bold text-ink'
                          : 'font-sans-medium',
                        tone === 'waiting' ? 'text-ink-faint' : 'text-ink',
                      )}
                      numberOfLines={2}
                    >
                      {step.label}
                    </Text>
                    {liveLine === null ? null : (
                      <Text
                        className={cn(
                          'mt-0.5 text-[12.5px] leading-[18px]',
                          tone === 'failed' ? 'text-error' : 'text-ink-dim',
                        )}
                        numberOfLines={1}
                      >
                        {liveLine}
                      </Text>
                    )}
                  </View>
                  <DisclosureChevron expanded={open} size={15} />
                </Tap>
                {step.id === 'confirm' && confirmLink !== null ? (
                  <ConfirmLinkButton
                    link={confirmLink}
                    showTime={tone !== 'waiting'}
                  />
                ) : null}
              </View>
              {open ? (
                <View className="flex-row">
                  <View className="w-10 items-center">
                    <Connector visible={next !== undefined} lit={nextLit} />
                  </View>
                  <View className="ml-3 min-w-0 flex-1 gap-3 pb-4 pl-[30px]">
                    <Text className="text-[12.5px] leading-[19px] text-ink-dim">
                      {step.explanation}
                    </Text>
                    <StepEntries
                      stepId={step.id}
                      run={history}
                      latestDeposit={latestDeposit}
                    />
                  </View>
                </View>
              ) : null}
            </Fragment>
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

/**
 * During a run the deposit is the one the agent just broadcast, and its time
 * shows only once Blockscout reports that same transaction.
 */
function confirmLinkFor(
  liveRun: AgentRunStatus | null,
  latestDeposit: AgentTransaction | null,
): ConfirmLink | null {
  if (liveRun === null) {
    return latestDeposit === null
      ? null
      : {
          hash: latestDeposit.hash,
          timestampMs: latestDeposit.timestampMs,
          label: 'View the confirmed deposit on Basescan',
        };
  }
  const hash = liveRun.depositHash;
  if (hash === null) return null;
  return {
    hash,
    timestampMs:
      latestDeposit?.hash.toLowerCase() === hash.toLowerCase()
        ? latestDeposit.timestampMs
        : null,
    label: "View this run's deposit on Basescan",
  };
}

function ConfirmLinkButton({
  link,
  showTime,
}: {
  link: ConfirmLink;
  showTime: boolean;
}) {
  return (
    <Tap
      accessibilityRole="link"
      accessibilityLabel={link.label}
      onPress={() =>
        void Linking.openURL(basescanTxUrl(BASESCAN_URL, link.hash))
      }
      className="ml-2 flex-row items-center gap-1.5 self-center py-3 pl-1"
    >
      {showTime && link.timestampMs !== null ? (
        <Text className="font-mono text-[12.5px] text-ink-dim">
          {formatClockTime(link.timestampMs)}
        </Text>
      ) : null}
      <ExternalLink size={12} color={tokens.color['ink-faint']} />
    </Tap>
  );
}

function StepEntries({
  stepId,
  run,
  latestDeposit,
}: {
  stepId: AgentLoopStepId;
  run: AgentRunStatus | null;
  latestDeposit: AgentTransaction | null;
}) {
  if (run === null) {
    // No local run to show (the deployed site): the chain still has one.
    if (stepId !== 'confirm' || latestDeposit === null) return null;
    return (
      <LinkChip
        link={{
          label: 'Latest deposit on Basescan',
          url: basescanTxUrl(BASESCAN_URL, latestDeposit.hash),
        }}
        context="The agent's latest confirmed deposit"
      />
    );
  }
  const step = run.steps[stepId];
  // The live line truncates; the full error (hashes included) reads here.
  const error = step.state === 'failed' ? run.error : null;
  if (step.entries.length === 0 && error === null) return null;
  return (
    <View className="gap-2 border-l border-line pl-3">
      {step.entries.map((entry, index) => (
        <View key={index} className="gap-1.5">
          <Text className="break-words text-[12.5px] leading-[18px] text-ink">
            {entry.text}
          </Text>
          {entry.link === null ? null : (
            <LinkChip link={entry.link} context={entry.text} />
          )}
        </View>
      ))}
      {error === null ? null : (
        <Text className="break-words text-[12.5px] leading-[18px] text-error">
          {error}
        </Text>
      )}
    </View>
  );
}

function LinkChip({ link, context }: { link: AgentRunLink; context: string }) {
  return (
    <Tap
      accessibilityRole="link"
      accessibilityLabel={`${link.label}: ${context}`}
      onPress={() => void Linking.openURL(link.url)}
      className="flex-row items-center gap-1.5 self-start rounded-pill border border-[rgba(91,147,255,.45)] bg-[rgba(0,82,255,.12)] px-3 py-1"
    >
      <Text className="font-sans-medium text-[12px] text-[#a9c4ff]">
        {link.label}
      </Text>
      <ExternalLink size={11} color={BASE_BLUE_BRIGHT} />
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
  spinner,
}: {
  number: number;
  tone: AgentLoopStepTone;
  final: boolean;
  /** A real run shows a spinner; a replay or live playback pulses. */
  spinner: boolean;
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
  if (tone === 'failed') {
    return (
      <View
        accessibilityLabel={`Step ${number} failed`}
        className="h-8 w-8 items-center justify-center rounded-full border-2 border-error bg-[rgba(255,111,97,.14)]"
      >
        <X size={15} color={tokens.color.error} strokeWidth={2.6} />
      </View>
    );
  }
  return (
    <View
      className="h-8 w-8 items-center justify-center rounded-full border-2 bg-[rgba(0,82,255,.14)]"
      style={{ borderColor: BASE_BLUE_BRIGHT }}
    >
      {tone === 'done' ? (
        <Text className="font-mono-semibold text-[12px] text-[#a9c4ff]">
          {number}
        </Text>
      ) : spinner ? (
        <ActivityIndicator
          size="small"
          color={BASE_BLUE_BRIGHT}
          accessibilityLabel={`Step ${number} in progress`}
        />
      ) : (
        <PulseDot color={BASE_BLUE_BRIGHT} size={7} />
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
}): ReactNode {
  const Icon = STEP_ICONS[stepId];
  if (Icon === null) {
    return (
      <View className={cn(tone === 'waiting' && 'opacity-40')}>
        <ChainMark chainKey="base" size={ICON_SIZE} />
      </View>
    );
  }
  return (
    <Icon size={ICON_SIZE} color={iconColor(tone, final)} strokeWidth={1.8} />
  );
}

function iconColor(tone: AgentLoopStepTone, final: boolean): string {
  if (tone === 'waiting') return tokens.color['ink-faint'];
  if (tone === 'failed') return tokens.color.error;
  return final && tone === 'done' ? tokens.color.success : BASE_BLUE_BRIGHT;
}

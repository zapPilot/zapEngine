import { tokens } from '@zapengine/design-tokens/tokens';
import { Play, Zap } from 'lucide-react-native';
import { ActivityIndicator, Text, View } from 'react-native';

import { BASE_BLUE_BRIGHT } from '@/components/aiWallet/aiWalletTheme';
import { PulseDot } from '@/components/aiWallet/PulseDot';
import type { AgentRunPhase } from '@/components/aiWallet/useLocalAgentRun';
import { Tap } from '@/components/ui/Tap';
import { cn } from '@/lib/cn';

interface AiWalletHeaderProps {
  wide: boolean;
  configured: boolean;
  reconnecting: boolean;
  replayLabel: string;
  replayDisabled: boolean;
  onReplay: () => void;
  /** `null` outside local dev, where no agent can be triggered. */
  runNow: { phase: AgentRunPhase; onPress: () => void } | null;
}

const RUN_NOW_LABELS: Readonly<Record<AgentRunPhase, string>> = {
  idle: 'Run agent now',
  starting: 'Starting…',
  running: 'Agent running…',
};

export function AiWalletHeader({
  wide,
  configured,
  reconnecting,
  replayLabel,
  replayDisabled,
  onReplay,
  runNow,
}: AiWalletHeaderProps) {
  return (
    <View
      className={cn(
        'px-5 pt-2',
        wide ? 'flex-row items-center justify-between gap-8' : 'gap-5',
      )}
    >
      <View className="shrink-0">
        <Text
          className={cn(
            'font-sans-semibold text-ink',
            wide
              ? 'text-[44px] leading-[50px] tracking-[-1px]'
              : 'text-[32px] leading-[38px] tracking-[-0.5px]',
          )}
        >
          AI Wallet
        </Text>
        <AgentStatus configured={configured} reconnecting={reconnecting} />
      </View>
      <View
        className={cn(
          'flex-row flex-wrap items-center gap-3',
          wide ? 'min-w-0 shrink justify-end' : 'max-w-full',
        )}
      >
        {runNow === null ? null : <RunNowButton {...runNow} />}
        <Tap
          accessibilityRole="button"
          accessibilityLabel={replayLabel}
          accessibilityState={{ disabled: replayDisabled }}
          disabled={replayDisabled}
          onPress={onReplay}
          className={cn(
            'min-h-12 flex-row items-center gap-3 rounded-pill border border-[rgba(91,147,255,.55)] bg-[rgba(0,82,255,.12)] py-1.5 pl-1.5 pr-5',
            wide ? 'min-w-0 max-w-[480px] shrink' : 'max-w-full',
            replayDisabled && 'opacity-40',
          )}
        >
          <View className="h-9 w-9 items-center justify-center rounded-full border border-[rgba(91,147,255,.45)] bg-[rgba(91,147,255,.16)]">
            <Play
              size={14}
              color={BASE_BLUE_BRIGHT}
              fill={BASE_BLUE_BRIGHT}
              style={{ marginLeft: 2 }}
            />
          </View>
          <Text
            className="shrink font-sans-semibold text-[14px] text-ink"
            numberOfLines={1}
          >
            {replayLabel}
          </Text>
        </Tap>
      </View>
    </View>
  );
}

function RunNowButton({
  phase,
  onPress,
}: {
  phase: AgentRunPhase;
  onPress: () => void;
}) {
  const busy = phase !== 'idle';
  const label = RUN_NOW_LABELS[phase];
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      // Disabled looks come from classes: web drops a style object on a
      // disabled Pressable.
      className={cn(
        'min-h-12 flex-row items-center gap-2 rounded-pill px-5',
        busy
          ? 'border border-line-hi bg-[rgba(255,255,255,.06)]'
          : 'border border-[#0052ff] bg-[#0052ff]',
      )}
    >
      {busy ? (
        <ActivityIndicator size="small" color={tokens.color['ink-dim']} />
      ) : (
        <Zap size={15} color={tokens.color.ink} fill={tokens.color.ink} />
      )}
      <Text
        className={cn(
          'font-sans-semibold text-[14px]',
          busy ? 'text-ink-dim' : 'text-ink',
        )}
      >
        {label}
      </Text>
    </Tap>
  );
}

function AgentStatus({
  configured,
  reconnecting,
}: {
  configured: boolean;
  reconnecting: boolean;
}) {
  if (!configured) {
    return (
      <View className="mt-2.5 flex-row items-center gap-2">
        <StaticDot color={tokens.color['ink-faint']} />
        <Text className="font-sans-medium text-[14px] text-ink-dim">
          Not deployed
        </Text>
      </View>
    );
  }
  return (
    <View className="mt-2.5 flex-row flex-wrap items-center gap-x-3 gap-y-1">
      {reconnecting ? (
        <View className="flex-row items-center gap-2">
          <StaticDot color={tokens.color.warning} />
          <Text
            className="font-sans-semibold text-[14px]"
            style={{ color: tokens.color.warning }}
          >
            Reconnecting
          </Text>
        </View>
      ) : (
        <View className="flex-row items-center gap-0.5">
          <PulseDot />
          <Text className="font-sans-semibold text-[14px] text-success">
            Live
          </Text>
        </View>
      )}
      <View className="h-4 w-px bg-line-hi" />
      <Text className="text-[14px] text-ink-dim">Agent monitoring on Base</Text>
    </View>
  );
}

function StaticDot({ color }: { color: string }) {
  return (
    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
  );
}

import { CloudOff, ExternalLink, XCircle } from 'lucide-react-native';
import { Linking, Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';
import {
  formatInteger,
  type SimulationVerdictTone,
} from '@/integration/simulationPreviewModel';

export const VERDICT_CLASSES: Record<SimulationVerdictTone, string> = {
  success: 'border-success/30 bg-success/10',
  error: 'border-error/30 bg-error/10',
  neutral: 'border-line-hi bg-surface-elevated',
};

export const VERDICT_TEXT_CLASSES: Record<SimulationVerdictTone, string> = {
  success: 'text-success',
  error: 'text-error',
  neutral: 'text-ink-dim',
};

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2.5 font-mono-semibold text-[9px] uppercase tracking-[.8px] text-ink-faint">
      {children}
    </Text>
  );
}

export function SimulationBlockingBanner({
  failed,
  reason,
}: {
  failed: boolean;
  reason: string;
}) {
  return (
    <View
      accessibilityRole="alert"
      className={
        failed
          ? 'flex-row items-start gap-3 rounded-2xl border border-error/30 bg-error/10 p-4'
          : 'flex-row items-start gap-3 rounded-2xl border border-line-hi bg-surface p-4'
      }
    >
      {failed ? (
        <XCircle size={18} color="#ff6f61" />
      ) : (
        <CloudOff size={18} color="#a1a1aa" />
      )}
      <View className="min-w-0 flex-1">
        <Text
          className={
            failed
              ? 'font-sans-semibold text-[12px] text-error'
              : 'font-sans-semibold text-[12px] text-ink'
          }
        >
          {failed
            ? 'This transaction would revert'
            : 'We could not verify this transaction'}
        </Text>
        <Text
          className={
            failed
              ? 'mt-1 text-[11px] leading-[17px] text-error'
              : 'mt-1 text-[11px] leading-[17px] text-ink-dim'
          }
        >
          {reason}
        </Text>
      </View>
    </View>
  );
}

/** The block-number / call-gas pair both Tenderly evidence blocks report. */
export function SimulationEvidenceStats({
  blockNumber,
  callGas,
  className = 'flex-row gap-4',
}: {
  blockNumber: number | null | undefined;
  callGas: string | number | null;
  className?: string;
}) {
  return (
    <View className={className}>
      <View className="flex-1">
        <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
          Block
        </Text>
        <Text className="mt-1 font-mono text-[10px] text-ink-dim">
          {blockNumber?.toLocaleString('en-US') ?? 'Unavailable'}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
          Call gas
        </Text>
        <Text className="mt-1 font-mono text-[10px] text-ink-dim">
          {formatInteger(callGas)}
        </Text>
      </View>
    </View>
  );
}

/**
 * Public Tenderly share links. `label` differs per surface — the route review
 * numbers results, the Privy preview names the step's method.
 */
export function SimulationShareLinks({
  shareUrls,
  label,
  className = 'gap-2 border-t border-line pt-3',
}: {
  shareUrls: readonly string[];
  label: (index: number) => string;
  className?: string;
}) {
  if (shareUrls.length === 0) {
    return null;
  }

  return (
    <View className={className}>
      <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
        Public simulation results
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {shareUrls.map((url, index) => (
          <Tap
            key={`${url}-${index}`}
            accessibilityLabel={`View simulation ${index + 1} on Tenderly`}
            accessibilityRole="link"
            className="min-h-9 max-w-full flex-row items-center gap-2 rounded-xl border border-line-hi bg-bg px-3"
            onPress={() => void Linking.openURL(url)}
          >
            <ExternalLink size={13} color="#d4c5a3" />
            <Text
              className="max-w-[230px] font-sans-semibold text-[10px] text-accent"
              numberOfLines={1}
            >
              {label(index)}
            </Text>
          </Tap>
        ))}
      </View>
    </View>
  );
}

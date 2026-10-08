import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';
import { CloudOff, ExternalLink, XCircle } from 'lucide-react-native';
import { Linking, Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';
import {
  formatInteger,
  type SimulationVerdictTone,
} from '@/integration/simulationPreviewModel';

export const VERDICT_CLASSES: Record<SimulationVerdictTone, string> = {
  success: 'border-ink/30 bg-ink/10',
  error: 'border-alert bg-alert-wash',
  neutral: 'border-rule-2 bg-well',
};

export const VERDICT_TEXT_CLASSES: Record<SimulationVerdictTone, string> = {
  success: 'text-ink',
  error: 'text-alert',
  neutral: 'text-ink-2',
};

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
          ? 'flex-row items-start gap-3 rounded-panel border border-alert bg-alert-wash p-4'
          : 'flex-row items-start gap-3 rounded-panel border border-rule-2 bg-sheet p-4'
      }
    >
      {failed ? (
        <Icon icon={XCircle} size="md" tone="alert" />
      ) : (
        <Icon icon={CloudOff} size="md" tone="secondary" />
      )}
      <View className="min-w-0 flex-1">
        <Text
          className={
            failed
              ? 'font-text-semibold text-caption text-alert'
              : 'font-text-semibold text-caption text-ink'
          }
        >
          {failed
            ? 'This transaction would revert'
            : 'We could not verify this transaction'}
        </Text>
        <Text
          className={cn(
            'font-text text-body',
            failed
              ? 'mt-1 text-label leading-[17px] text-alert'
              : 'mt-1 text-label leading-[17px] text-ink-2',
          )}
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
        <Text className="font-mono-semibold text-data uppercase tracking-[.6px] text-ink-3">
          Block
        </Text>
        <Text className="mt-1 font-mono text-data text-ink-2">
          {blockNumber?.toLocaleString('en-US') ?? 'Unavailable'}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="font-mono-semibold text-data uppercase tracking-[.6px] text-ink-3">
          Call gas
        </Text>
        <Text className="mt-1 font-mono text-data text-ink-2">
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
  className = 'gap-2 border-t border-rule pt-3',
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
      <Text className="font-mono-semibold text-data uppercase tracking-[.6px] text-ink-3">
        Public simulation results
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {shareUrls.map((url, index) => (
          <Tap
            key={`${url}-${index}`}
            accessibilityLabel={`View simulation ${index + 1} on Tenderly`}
            accessibilityRole="link"
            className="min-h-9 max-w-full flex-row items-center gap-2 rounded-panel border border-rule-2 bg-ground px-3"
            onPress={() => void Linking.openURL(url)}
          >
            <Icon icon={ExternalLink} size="xs" tone="sign" />
            <Text
              className="max-w-[230px] font-text-semibold text-label text-ink"
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

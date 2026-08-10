import { CloudOff, XCircle } from 'lucide-react-native';
import { Text, View } from 'react-native';

import type { SimulationVerdictTone } from '@/integration/simulationPreviewModel';

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

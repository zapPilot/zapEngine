import { Check, Circle, LoaderCircle, X } from 'lucide-react-native';
import type { ReactElement, ReactNode } from 'react';
import { Text, View } from 'react-native';

type TimelineTone = 'waiting' | 'active' | 'done' | 'failed';

interface ProgressTimelineRowProps {
  /** Overrides the tone-derived circle glyph for screen-specific nuances. */
  icon?: ReactNode;
  label: string;
  detail: string;
  tone: TimelineTone;
  isLast?: boolean;
  /** Extra lines rendered under the detail (hashes, ids). */
  children?: ReactNode;
}

function toneIcon(tone: TimelineTone): ReactElement {
  if (tone === 'done') {
    return <Check size={14} color="#0a0a0a" strokeWidth={2.5} />;
  }
  if (tone === 'active') {
    return <LoaderCircle size={14} color="#d4c5a3" />;
  }
  if (tone === 'failed') {
    return <X size={14} color="#ef7474" strokeWidth={2.5} />;
  }
  return <Circle size={8} color="#52525b" />;
}

/** The single timeline row every execution progress screen draws. */
export function ProgressTimelineRow({
  icon,
  label,
  detail,
  tone,
  isLast = false,
  children,
}: ProgressTimelineRowProps): ReactElement {
  const done = tone === 'done';
  const active = tone === 'active';
  return (
    <View className="flex-row gap-3">
      <View className="items-center">
        <View
          className="h-8 w-8 items-center justify-center rounded-full border"
          style={{
            borderColor: done
              ? '#d4c5a3'
              : active
                ? 'rgba(212,197,163,.45)'
                : tone === 'failed'
                  ? 'rgba(239,116,116,.45)'
                  : 'rgba(255,255,255,.08)',
            backgroundColor: done
              ? '#d4c5a3'
              : active
                ? 'rgba(212,197,163,.09)'
                : 'rgba(255,255,255,.02)',
          }}
        >
          {icon ?? toneIcon(tone)}
        </View>
        {!isLast ? (
          <View
            className="min-h-7 flex-1 w-px"
            style={{
              backgroundColor: done
                ? 'rgba(212,197,163,.45)'
                : 'rgba(255,255,255,.07)',
            }}
          />
        ) : null}
      </View>
      <View className="flex-1 pb-5 pt-1">
        <Text
          className="font-sans-semibold text-[13.5px]"
          style={{ color: tone === 'waiting' ? '#71717a' : '#f4f4f5' }}
        >
          {label}
        </Text>
        <Text className="mt-1 text-[11px] leading-[16px] text-ink-dim">
          {detail}
        </Text>
        {children}
      </View>
    </View>
  );
}

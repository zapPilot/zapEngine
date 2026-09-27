import { Check, Circle, LoaderCircle, X } from 'lucide-react-native';
import type { ReactElement, ReactNode } from 'react';
import { Text, View } from 'react-native';

type TimelineTone = 'waiting' | 'active' | 'done' | 'failed';

interface ProgressTimelineRowProps {
  /** Overrides the tone-derived circle glyph for screen-specific nuances. */
  icon?: ReactNode;
  /** Chain/protocol artwork shown beside the step title. */
  leadingVisual?: ReactNode;
  label: string;
  detail: string;
  tone: TimelineTone;
  isLast?: boolean;
  /** Extra lines rendered under the detail (hashes, ids). */
  children?: ReactNode;
}

function toneLabel(tone: TimelineTone): string {
  if (tone === 'done') return 'Done';
  if (tone === 'active') return 'In progress';
  if (tone === 'failed') return 'Needs attention';
  return 'Next';
}

function toneTextColor(tone: TimelineTone): string {
  if (tone === 'done' || tone === 'active') return '#d4c5a3';
  if (tone === 'failed') return '#ef7474';
  return '#71717a';
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
  leadingVisual,
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
      <View className="flex-1 pb-4">
        <View
          className="rounded-[14px] px-3 py-2.5"
          style={{
            borderWidth: active || tone === 'failed' ? 1 : 0,
            borderColor:
              tone === 'failed'
                ? 'rgba(239,116,116,.28)'
                : 'rgba(212,197,163,.22)',
            backgroundColor: active
              ? 'rgba(212,197,163,.055)'
              : tone === 'failed'
                ? 'rgba(239,116,116,.035)'
                : 'transparent',
          }}
        >
          <View className="flex-row items-center gap-2">
            {leadingVisual ? (
              <View className="h-6 min-w-6 items-center justify-center">
                {leadingVisual}
              </View>
            ) : null}
            <Text
              className="min-w-0 flex-1 font-sans-semibold text-[13.5px]"
              style={{ color: tone === 'waiting' ? '#71717a' : '#f4f4f5' }}
            >
              {label}
            </Text>
            <View
              className="rounded-full border px-2 py-0.5"
              style={{ borderColor: `${toneTextColor(tone)}33` }}
            >
              <Text
                className="font-sans-medium text-[9px]"
                style={{ color: toneTextColor(tone) }}
              >
                {toneLabel(tone)}
              </Text>
            </View>
          </View>
          <Text className="mt-1.5 text-[11px] leading-[16px] text-ink-dim">
            {detail}
          </Text>
          {children}
        </View>
      </View>
    </View>
  );
}

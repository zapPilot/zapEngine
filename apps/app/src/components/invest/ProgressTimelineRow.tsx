import { palette } from '@/lib/palette';
import { Icon } from '@/components/ui/Icon';
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
  if (tone === 'active') return palette['sign-ink'];
  if (tone === 'done') return palette.ink;
  if (tone === 'failed') return palette.alert;
  return palette['ink-3'];
}

function toneIcon(tone: TimelineTone): ReactElement {
  if (tone === 'done') {
    return <Icon icon={Check} size="xs" tone="inverse" />;
  }
  if (tone === 'active') {
    return <Icon icon={LoaderCircle} size="xs" tone="sign" />;
  }
  if (tone === 'failed') {
    return <Icon icon={X} size="xs" tone="default" />;
  }
  return <Icon icon={Circle} size="xs" tone="muted" />;
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
          className="h-8 w-8 items-center justify-center rounded-round border"
          style={{
            borderColor: done
              ? palette.ink
              : active
                ? palette['rule-2']
                : tone === 'failed'
                  ? palette['alert']
                  : palette['rule'],
            backgroundColor: done
              ? palette.ink
              : active
                ? palette['sign-wash']
                : palette['sheet'],
          }}
        >
          {icon ?? toneIcon(tone)}
        </View>
        {!isLast ? (
          <View
            className="min-h-7 flex-1 w-px"
            style={{
              backgroundColor: done ? palette['rule-2'] : palette.rule,
            }}
          />
        ) : null}
      </View>
      <View className="flex-1 pb-4">
        <View
          className="rounded-panel px-3 py-2.5"
          style={{
            borderWidth: active || tone === 'failed' ? 1 : 0,
            borderColor:
              tone === 'failed' ? palette['alert'] : palette['rule-2'],
            backgroundColor: active
              ? palette['sign-wash']
              : tone === 'failed'
                ? palette['alert-wash']
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
              className="min-w-0 flex-1 font-text-semibold text-body-sm"
              style={{
                color: tone === 'waiting' ? palette['ink-3'] : '#f4f4f5',
              }}
            >
              {label}
            </Text>
            <View
              className="rounded-round border px-2 py-0.5"
              style={{ borderColor: `${toneTextColor(tone)}33` }}
            >
              <Text
                className="font-text-medium text-label"
                style={{ color: toneTextColor(tone) }}
              >
                {toneLabel(tone)}
              </Text>
            </View>
          </View>
          <Text className="font-mono-medium mt-1.5 text-label leading-[16px] text-ink-2">
            {detail}
          </Text>
          {children}
        </View>
      </View>
    </View>
  );
}

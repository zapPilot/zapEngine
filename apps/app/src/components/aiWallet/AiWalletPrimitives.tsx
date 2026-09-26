import { tokens } from '@zapengine/design-tokens/tokens';
import { ExternalLink } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';

import { Pill } from '@/components/ui/Pill';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Tap } from '@/components/ui/Tap';
import { cn } from '@/lib/cn';

export function CardHeading({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row flex-wrap items-start justify-between gap-2">
      <View className="min-w-0 shrink">
        <SectionLabel className="text-[#9a8f78]">{eyebrow}</SectionLabel>
        <Text className="mt-1 font-sans-semibold text-[16px] text-ink">
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

export type BadgeTone = 'live' | 'replay' | 'snapshot';

const BADGE_STYLES: Readonly<
  Record<BadgeTone, { className: string; dot: string; text: string }>
> = {
  live: {
    className: 'border border-[rgba(122,216,143,.4)] bg-[rgba(122,216,143,.1)]',
    dot: tokens.color.success,
    text: 'text-success',
  },
  replay: {
    className: 'border border-[rgba(232,176,75,.45)] bg-[rgba(232,176,75,.1)]',
    dot: tokens.color.warning,
    text: 'text-[#e8b04b]',
  },
  snapshot: {
    className: 'border border-line-hi bg-[rgba(255,255,255,.04)]',
    dot: tokens.color['ink-dim'],
    text: 'text-ink-dim',
  },
};

export function StatusBadge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: string;
}) {
  const style = BADGE_STYLES[tone];
  return (
    <Pill className={cn('px-2 py-0.5', style.className)}>
      <View
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: style.dot }}
      />
      <Text
        className={cn(
          'font-mono-semibold text-[9.5px] uppercase tracking-[0.8px]',
          style.text,
        )}
      >
        {children}
      </Text>
    </Pill>
  );
}

export function ExplorerLink({
  url,
  label,
  accessibilityLabel,
  className,
}: {
  url: string;
  label: string;
  accessibilityLabel: string;
  className?: string;
}) {
  return (
    <Tap
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      className={cn(
        'min-h-8 flex-row items-center gap-1.5 self-start rounded-xl border border-line-hi bg-bg px-2.5',
        className,
      )}
      onPress={() => void Linking.openURL(url)}
    >
      <ExternalLink size={12} color={tokens.color.accent} />
      <Text className="font-sans-semibold text-[11px] text-accent">
        {label}
      </Text>
    </Tap>
  );
}

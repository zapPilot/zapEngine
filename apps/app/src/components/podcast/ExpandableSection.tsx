import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Icon } from '@/components/ui/Icon';

import { Tap } from '@/components/ui/Tap';

/**
 * Collapsible list section with a chevron header, mirroring the mobile
 * `listened_section_header.dart` and the app's `useState`+`Tap` disclosure idiom.
 */
export function ExpandableSection({
  title,
  count,
  trailing,
  defaultExpanded = false,
  children,
}: {
  title: string;
  count?: number;
  /** Sits at the far end of the header rule, e.g. a total. */
  trailing?: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View className="pt-2">
      <Tap
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}${count !== undefined ? ` (${count})` : ''}`}
        onPress={() => setExpanded((current) => !current)}
        className="min-h-hit flex-row items-center gap-2 py-3"
      >
        <Icon icon={expanded ? ChevronDown : ChevronRight} tone="muted" />
        <Text variant="heading">{title}</Text>
        {count !== undefined ? (
          <Text variant="caption" tone="muted" numeric>
            ({count})
          </Text>
        ) : null}
        <View className="ml-2 h-px flex-1 bg-rule" />
        {trailing === undefined ? null : (
          <View className="ml-2">{trailing}</View>
        )}
      </Tap>
      {expanded ? children : null}
    </View>
  );
}

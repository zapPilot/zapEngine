import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';

/**
 * Collapsible list section with a chevron header, mirroring the mobile
 * `listened_section_header.dart` and the app's `useState`+`Tap` disclosure idiom.
 */
export function ExpandableSection({
  title,
  count,
  defaultExpanded = false,
  children,
}: {
  title: string;
  count?: number;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View className="px-5 pt-2">
      <Tap
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}${count !== undefined ? ` (${count})` : ''}`}
        onPress={() => setExpanded((current) => !current)}
        className="flex-row items-center gap-2 py-3"
      >
        {expanded ? (
          <ChevronDown size={18} strokeWidth={2} color="#a1a1aa" />
        ) : (
          <ChevronRight size={18} strokeWidth={2} color="#a1a1aa" />
        )}
        <Text className="font-sans-semibold text-[15px] text-ink">{title}</Text>
        {count !== undefined ? (
          <Text className="font-mono text-[11px] text-ink-faint">
            ({count})
          </Text>
        ) : null}
        <View className="ml-2 h-[1px] flex-1 bg-line" />
      </Tap>
      {expanded ? children : null}
    </View>
  );
}

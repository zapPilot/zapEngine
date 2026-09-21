import type { ReactNode } from 'react';
import { View } from 'react-native';

interface ProtocolIconFrameProps {
  label: string;
  size?: number;
  labelled?: boolean;
  children?: ReactNode;
}

/**
 * Squircle venue mark frame. The shape is the point: a rounded square says "a
 * place you put money into", where a circle says "an asset you hold". Keeps
 * brand lookups out so the iOS read-only variant can share the frame without
 * pulling venue strings into its module graph.
 */
export function ProtocolIconFrame({
  label,
  size = 26,
  labelled = false,
  children,
}: ProtocolIconFrameProps) {
  return (
    <View
      className="shrink-0 items-center justify-center overflow-hidden border border-line bg-[rgba(255,255,255,.04)]"
      // Proportional rather than a fixed `rounded-xl`: at the 18–26pt sizes
      // this renders at, a 12px radius rounds the square into a circle and the
      // asset-versus-venue shape distinction disappears.
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
      {...(labelled
        ? { accessible: true, accessibilityLabel: label }
        : {
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
          })}
    >
      {children}
    </View>
  );
}

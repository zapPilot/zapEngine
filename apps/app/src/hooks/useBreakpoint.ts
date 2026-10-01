import { Platform, useWindowDimensions } from 'react-native';
import { tokens } from '@zapengine/design-tokens/tokens';
import { breakpointForWidth } from '@/lib/layout';
export function useBreakpoint() {
  const { width } = useWindowDimensions();
  return {
    width,
    breakpoint: breakpointForWidth(width),
    hasSideNav: Platform.OS === 'web' && width >= tokens.breakpoint.expanded,
  };
}

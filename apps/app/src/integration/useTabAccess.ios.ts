import type { TabAccess } from '@/integration/useTabAccess';

// iOS has no wallet backend mounted (see AppProviders.ios.tsx). Tabs stay
// navigable; financial routes decide whether to show read-only analytics or an
// informational lock screen. Deliberately does not import useWalletProvider.
export function useTabAccess(): TabAccess {
  return {
    isAccessible: () => true,
    connect: async () => 'connected',
  };
}

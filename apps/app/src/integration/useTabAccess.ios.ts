import type { TabAccess } from '@/integration/useTabAccess';

// iOS ships podcast-only with no wallet backend mounted (see
// AppProviders.ios.tsx), so every tab stays accessible and there is nothing
// to connect. Deliberately does not import useAccount / useWalletProvider.
export function useTabAccess(): TabAccess {
  return {
    isAccessible: () => true,
    connect: async () => {},
  };
}

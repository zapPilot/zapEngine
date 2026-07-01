import { isPrivyEnabled } from '@zapengine/app-core/lib/env/privy';
import { PrivyAuthProvider } from '@zapengine/app-core/providers/PrivyAuthProvider';
import { QueryProvider } from '@zapengine/app-core/providers/QueryProvider';
import { WalletProvider } from '@zapengine/app-core/providers/WalletProvider';
import type { ReactNode } from 'react';

import { SimulationPreviewModal } from '@/components/SimulationPreviewModal';
import { DesktopToastProvider } from '@/integration/DesktopToastProvider';

/**
 * App-wide data providers for the desktop shell, sharing @zapengine/app-core's
 * React Query client + Privy wallet backend with the web frontend.
 *
 * Order mirrors the frontend's BundleProviders: QueryProvider → PrivyAuthProvider
 * → WalletProvider. WalletProvider's `renderSimulationPreview` render-prop is
 * wired to the desktop's own on-brand `SimulationPreviewModal`.
 *
 * When `VITE_PRIVY_APP_ID` is missing, PrivyAuthProvider throws at import time;
 * we guard with `isPrivyEnabled()` and render a configuration notice instead of a
 * blank screen.
 */
export function DesktopProviders({ children }: { children: ReactNode }) {
  if (!isPrivyEnabled()) {
    return <PrivyConfigNotice />;
  }

  return (
    <QueryProvider>
      <PrivyAuthProvider>
        <WalletProvider
          renderSimulationPreview={(props) => (
            <SimulationPreviewModal {...props} />
          )}
        >
          <DesktopToastProvider>{children}</DesktopToastProvider>
        </WalletProvider>
      </PrivyAuthProvider>
    </QueryProvider>
  );
}

function PrivyConfigNotice() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-6 text-center">
      <div className="max-w-sm">
        <div className="font-serif text-[22px] text-ink">
          Wallet not configured
        </div>
        <p className="mt-2 text-[13px] text-ink-dim">
          Set <code className="font-mono text-ink">VITE_PRIVY_APP_ID</code> in
          the repo-root <code className="font-mono text-ink">.env</code> to
          enable the wallet backend, then restart the dev server.
        </p>
      </div>
    </div>
  );
}

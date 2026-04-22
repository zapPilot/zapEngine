import type { ReactNode } from 'react';

import { ConnectWalletButton } from '@/components/WalletManager/components/ConnectWalletButton';

interface GhostModeOverlayProps {
  /** Content to show with blur effect */
  children: ReactNode;
  /** Whether ghost mode is enabled (typically isEmptyState) */
  enabled: boolean;
  /** Whether to show the Connect CTA (default: true) */
  showCTA?: boolean;
}

/**
 * Ghost Mode Overlay
 *
 * Wraps wallet-dependent content with a blur effect and optional Connect Wallet CTA
 * for unconnected users. Shows a preview of what the dashboard looks like
 * while encouraging wallet connection.
 *
 * Uses the shared ConnectWalletButton to ensure consistent wallet connection
 * behavior across the app.
 *
 * Industry-standard pattern used by Uniswap, Aave, Zapper, etc.
 */
export function GhostModeOverlay({
  children,
  enabled,
  showCTA = true,
}: GhostModeOverlayProps) {
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Blurred content layer */}
      <div className="blur-[2px] pointer-events-none select-none opacity-70">
        {children}
      </div>

      {/* Overlay - only show CTA if enabled */}
      {showCTA && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/20 backdrop-blur-[1px] rounded-2xl">
          <div className="flex flex-col items-center gap-3">
            {/* Preview badge */}
            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] font-bold uppercase tracking-wider rounded-full border border-purple-500/30">
              Preview
            </span>

            {/* Shared Connect Wallet Button - same logic as navbar */}
            <ConnectWalletButton />
          </div>
        </div>
      )}
    </div>
  );
}

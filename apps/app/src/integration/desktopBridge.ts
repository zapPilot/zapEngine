import type { ReactElement } from 'react';

/**
 * Native no-op half of the desktop bridge platform split. The Electron shell
 * only exists on web (apps/desktop loads the web export), so the
 * native bundle ships empty stubs — see desktopBridge.web.ts for the real
 * implementation.
 */

export interface DesktopRebalanceProposal {
  driftPercent: number;
  generatedAt: string;
  strategyId?: string;
}

/** Subscribes to Electron rebalance proposals + deep links (web only). */
export function useDesktopBridge(): void {
  // no-op on native
}

/**
 * Pushes {userId, walletAddress} to the Electron main-process scheduler
 * after login (web only). Renders nothing.
 */
export function DesktopSchedulerContextSync(): ReactElement | null {
  return null;
}

import type { DesktopUpdateState } from '@zapengine/types/shared';
import { router } from 'expo-router';
import { type ReactElement, useEffect, useState } from 'react';

import { useAccount } from '@/integration/useAccount';

import type { DesktopRebalanceProposal } from './desktopBridge';

export type { DesktopRebalanceProposal };

/**
 * Web half of the desktop bridge: when the bundle runs inside the Electron
 * shell (apps/desktop), window.zapDesktop is exposed by the preload
 * script. Contract: apps/desktop/src/shared/ipc.ts.
 *
 * Proposals only navigate to the invest flow — the user always reviews and
 * signs manually; nothing is executed unattended.
 */

type Unsubscribe = () => void;

type ZapDesktopBridge = {
  platform: 'electron';
  updates: {
    getState: () => Promise<DesktopUpdateState>;
    check: () => void;
    download: () => void;
    install: () => void;
    onStateChange: (
      callback: (state: DesktopUpdateState) => void,
    ) => Unsubscribe;
  };
  onRebalanceProposal(
    callback: (proposal: DesktopRebalanceProposal) => void,
  ): Unsubscribe;
  onDeepLink(callback: (url: string) => void): Unsubscribe;
  registerSchedulerContext(context: {
    userId: string;
    walletAddress: string;
  }): void;
  clearSchedulerContext(): void;
  openExternal(url: string): void;
};

const DEEP_LINK_PREFIX = 'zappilotv2://';

function getBridge(): ZapDesktopBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return (window as { zapDesktop?: ZapDesktopBridge }).zapDesktop;
}

export function useDesktopBridge(): void {
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) {
      return;
    }

    const offProposal = bridge.onRebalanceProposal((proposal) => {
      router.push({
        pathname: '/invest',
        params: {
          proposalDriftPercent: String(proposal.driftPercent),
          proposalGeneratedAt: proposal.generatedAt,
        },
      });
    });

    const offDeepLink = bridge.onDeepLink((url) => {
      if (!url.startsWith(DEEP_LINK_PREFIX)) {
        return;
      }
      const path = `/${url.slice(DEEP_LINK_PREFIX.length).replace(/^\/+/, '')}`;
      router.push(path as Parameters<typeof router.push>[0]);
    });

    return () => {
      offProposal();
      offDeepLink();
    };
  }, []);
}

export function DesktopSchedulerContextSync(): ReactElement | null {
  const { userId, address } = useAccount();

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) {
      return;
    }
    if (userId && address) {
      bridge.registerSchedulerContext({ userId, walletAddress: address });
    } else {
      bridge.clearSchedulerContext();
    }
  }, [userId, address]);

  return null;
}

export function useDesktopUpdate() {
  const [state, setState] = useState<DesktopUpdateState>();
  const bridge = getBridge();
  useEffect(() => {
    if (!bridge) return;
    let active = true,
      received = false;
    const off = bridge.updates.onStateChange((next) => {
      received = true;
      if (active) setState(next);
    });
    void bridge.updates
      .getState()
      .then((next) => {
        if (active && !received) setState(next);
      })
      .catch(() => {});
    bridge.updates.check();
    return () => {
      active = false;
      off();
    };
  }, [bridge]);
  return {
    state,
    update: () => bridge?.updates.download(),
    install: () => bridge?.updates.install(),
    retry: () => bridge?.updates.check(),
  };
}

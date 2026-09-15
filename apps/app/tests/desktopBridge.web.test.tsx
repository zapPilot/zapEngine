// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DesktopSchedulerContextSync,
  useDesktopBridge,
  type DesktopRebalanceProposal,
} from '@/integration/desktopBridge.web';

const mocks = vi.hoisted(() => ({
  account: { userId: null as string | null, address: null as string | null },
  push: vi.fn(),
}));

vi.mock('expo-router', () => ({ router: { push: mocks.push } }));
vi.mock('@/integration/useAccount', () => ({
  useAccount: () => mocks.account,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type ProposalListener = (proposal: DesktopRebalanceProposal) => void;
type LinkListener = (url: string) => void;

const bridge = {
  platform: 'electron' as const,
  proposalListener: null as ProposalListener | null,
  linkListener: null as LinkListener | null,
  offProposal: vi.fn(),
  offLink: vi.fn(),
  onRebalanceProposal: vi.fn((callback: ProposalListener) => {
    bridge.proposalListener = callback;
    return bridge.offProposal;
  }),
  onDeepLink: vi.fn((callback: LinkListener) => {
    bridge.linkListener = callback;
    return bridge.offLink;
  }),
  registerSchedulerContext: vi.fn(),
  clearSchedulerContext: vi.fn(),
  openExternal: vi.fn(),
};

function BridgeProbe(): ReactElement | null {
  useDesktopBridge();
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(node: ReactElement): Promise<void> {
  if (!root) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => root?.render(node));
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.proposalListener = null;
  bridge.linkListener = null;
  mocks.account.userId = null;
  mocks.account.address = null;
  delete (window as typeof window & { zapDesktop?: unknown }).zapDesktop;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  delete (window as typeof window & { zapDesktop?: unknown }).zapDesktop;
});

describe('useDesktopBridge web', () => {
  it('does nothing outside the Electron preload bridge', async () => {
    await render(createElement(BridgeProbe));
    expect(bridge.onRebalanceProposal).not.toHaveBeenCalled();
  });

  it('routes reviewed proposals and valid deep links, then unsubscribes', async () => {
    (window as typeof window & { zapDesktop?: unknown }).zapDesktop = bridge;
    await render(createElement(BridgeProbe));

    act(() => {
      bridge.proposalListener?.({
        driftPercent: 7.25,
        generatedAt: '2026-09-15T00:00:00.000Z',
      });
      bridge.linkListener?.('https://example.com/not-a-zap-link');
      bridge.linkListener?.('zappilotv2:////portfolio');
    });

    expect(mocks.push).toHaveBeenNthCalledWith(1, {
      pathname: '/invest',
      params: {
        proposalDriftPercent: '7.25',
        proposalGeneratedAt: '2026-09-15T00:00:00.000Z',
      },
    });
    expect(mocks.push).toHaveBeenNthCalledWith(2, '/portfolio');

    await act(async () => root?.unmount());
    root = null;
    expect(bridge.offProposal).toHaveBeenCalledOnce();
    expect(bridge.offLink).toHaveBeenCalledOnce();
  });
});

describe('DesktopSchedulerContextSync', () => {
  it('registers a complete scheduler identity and refreshes it on change', async () => {
    (window as typeof window & { zapDesktop?: unknown }).zapDesktop = bridge;
    mocks.account.userId = 'user-1';
    mocks.account.address = '0xabc';
    await render(createElement(DesktopSchedulerContextSync));

    expect(bridge.registerSchedulerContext).toHaveBeenCalledWith({
      userId: 'user-1',
      walletAddress: '0xabc',
    });

    mocks.account.address = '0xdef';
    await render(createElement(DesktopSchedulerContextSync));
    expect(bridge.registerSchedulerContext).toHaveBeenLastCalledWith({
      userId: 'user-1',
      walletAddress: '0xdef',
    });
  });

  it('clears partial or logged-out scheduler state and ignores plain web', async () => {
    (window as typeof window & { zapDesktop?: unknown }).zapDesktop = bridge;
    mocks.account.userId = 'user-1';
    await render(createElement(DesktopSchedulerContextSync));
    expect(bridge.clearSchedulerContext).toHaveBeenCalledOnce();

    delete (window as typeof window & { zapDesktop?: unknown }).zapDesktop;
    mocks.account.address = '0xabc';
    await render(createElement(DesktopSchedulerContextSync));
    expect(bridge.registerSchedulerContext).not.toHaveBeenCalled();
  });
});

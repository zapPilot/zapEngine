// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityRow } from '@/components/activity/ActivityRow';
import type { ActivityEvent } from '@/data/demo';

const openUrl = vi.hoisted(() => vi.fn());
const copyHash = vi.hoisted(() => vi.fn());

vi.mock('@zapengine/brand-assets', () => ({
  CHAIN_BRAND: {
    arbitrum: { chainId: 42161, label: 'Arbitrum' },
  },
  PROTOCOL_BRAND: { aave: { label: 'Aave' } },
  protocolBrandKeyFor: (value: string) =>
    value.toLowerCase().startsWith('aave') ? 'aave' : undefined,
}));

vi.mock('@zapengine/app-core/config/chains/display', () => ({
  getExplorerTxUrl: (_chainId: number, hash: string) =>
    `https://explorer.test/tx/${hash}`,
}));

vi.mock('expo-clipboard', () => ({ setStringAsync: copyHash }));
vi.mock('lucide-react-native', () => ({
  Copy: () => <span data-icon="copy" />,
  ExternalLink: () => <span data-icon="external" />,
}));
vi.mock('react-native', () => ({
  Linking: { openURL: openUrl },
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/token/ChainMark', () => ({
  ChainMark: ({ chainKey }: { chainKey: string }) => (
    <span data-chain={chainKey} />
  ),
}));
vi.mock('@/components/token/ProtocolIcon', () => ({
  ProtocolIcon: ({ protocol }: { protocol: string }) => (
    <span data-protocol-icon={protocol} />
  ),
}));
vi.mock('@/components/token/TokenIcon', () => ({
  TokenIcon: ({ symbol }: { symbol: string }) => (
    <span data-token-icon={symbol} />
  ),
}));
vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock('@/components/ui/Pill', () => ({
  Pill: ({ children }: { children?: ReactNode }) => <strong>{children}</strong>,
}));
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    hitSlop,
    onPress,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    hitSlop?: number;
    onPress?: () => void;
  }) => (
    <button
      aria-label={accessibilityLabel}
      data-accessibility-role={accessibilityRole}
      data-hit-slop={hitSlop}
      onClick={onPress}
    >
      {children}
    </button>
  ),
}));

const TX_HASH =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'activity',
    kind: 'withdraw',
    title: 'Sent USDC',
    status: 'Completed',
    meta: 'Arbitrum',
    time: '3m',
    chain: 'arbitrum',
    txHash: TX_HASH,
    tokenSymbol: 'USDC',
    categoryDeltas: [{ category: 'stable', usdNet: -10, label: '−10 USDC' }],
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  openUrl.mockReset();
  copyHash.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(activity: ActivityEvent) {
  await act(async () => {
    root.render(<ActivityRow event={activity} failedLabel="Failed" />);
  });
}

describe('ActivityRow', () => {
  it('renders compact hash actions with usable touch targets', async () => {
    await render(event());

    const open = container.querySelector(
      'button[aria-label="Open transaction 0x1234…cdef in explorer"]',
    );
    const copy = container.querySelector(
      'button[aria-label="Copy transaction hash 0x1234…cdef"]',
    );
    expect(open?.getAttribute('data-hit-slop')).toBe('12');
    expect(copy?.getAttribute('data-hit-slop')).toBe('12');

    await act(async () => {
      (open as HTMLButtonElement).click();
      (copy as HTMLButtonElement).click();
    });
    expect(openUrl).toHaveBeenCalledWith(`https://explorer.test/tx/${TX_HASH}`);
    expect(copyHash).toHaveBeenCalledWith(TX_HASH);
  });

  it('uses a token mark and omits the contract venue for plain transfers', async () => {
    await render(event());

    expect(container.querySelector('[data-token-icon="USDC"]')).not.toBeNull();
    expect(container.querySelector('[data-protocol-icon]')).toBeNull();
    expect(container.textContent).not.toContain('Contract interaction');
  });

  it('renders wallet attribution alongside protocol context', async () => {
    await render(
      event({
        wallet: { address: '0xabc', label: 'Main Wallet' },
        protocol: 'Aave V3',
      }),
    );

    expect(container.textContent).toContain('Main Wallet · Aave');
  });

  it('renders portfolio-internal wallet transfers as wallet-to-wallet context', async () => {
    await render(
      event({
        kind: 'internal-transfer',
        title: 'Moved USDC',
        walletTransfer: {
          from: { address: '0xaaa', label: 'Main Wallet' },
          to: { address: '0xbbb', label: 'Trading Wallet' },
        },
        flowLabels: ['−50 USDC'],
        categoryDeltas: [],
      }),
    );

    expect(container.textContent).toContain('Main Wallet → Trading Wallet');
    expect(container.textContent).toContain('−50 USDC');
  });

  it('renders protocol, at most two flows, failure, and gas metadata', async () => {
    await render(
      event({
        kind: 'contract-interaction',
        protocol: 'Aave V3',
        status: 'Failed',
        gasFeeLabel: '0.000012 ETH',
        categoryDeltas: [
          {
            category: 'stable',
            usdNet: -10,
            label: '−10 USDC · +0.004 ETH · +1 ALT',
          },
        ],
      }),
    );

    expect(
      container.querySelector('[data-protocol-icon="Aave V3"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain('Aave');
    expect(container.textContent).toContain('−10 USDC');
    expect(container.textContent).toContain('+0.004 ETH');
    expect(container.textContent).not.toContain('+1 ALT');
    expect(container.textContent).toContain('Failed');
    expect(container.textContent).toContain('Gas: 0.000012 ETH');
  });
});

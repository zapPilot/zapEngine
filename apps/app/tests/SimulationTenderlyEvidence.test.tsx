// @vitest-environment jsdom

import type { DepositReviewGroup } from '@zapengine/types/api';
import { act, type ReactNode } from 'react';
import { Linking } from 'react-native';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SimulationTenderlyEvidence } from '@/components/invest/simulation/SimulationTenderlyEvidence';

vi.mock('react-native', () => ({
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Linking: { openURL: vi.fn() },
}));

vi.mock('react-native-svg', () => ({
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Path: () => null,
}));

vi.mock('lucide-react-native', () => ({
  ChevronDown: () => null,
  ExternalLink: () => null,
  CheckCircle2: () => null,
  CircleDashed: () => null,
  XCircle: () => null,
}));

vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    accessibilityLabel,
    children,
    onPress,
  }: {
    accessibilityLabel?: string;
    children?: ReactNode;
    onPress?: () => void;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress} type="button">
      {children}
    </button>
  ),
}));

const WALLET = '0x1111111111111111111111111111111111111111';
const TARGET = '0x3333333333333333333333333333333333333333';
const HASH_A = `0x${'a'.repeat(64)}`;
const HASH_B = `0x${'b'.repeat(64)}`;
const HASH_C = `0x${'c'.repeat(64)}`;
const HASH_D = `0x${'d'.repeat(64)}`;

function createCall(
  overrides: Partial<DepositReviewGroup['calls'][number]> = {},
): DepositReviewGroup['calls'][number] {
  return {
    index: 0,
    to: TARGET,
    data: '0x1234',
    value: '0',
    method: 'depositFor',
    status: 'succeeded',
    gasUsed: '21000',
    error: null,
    ...overrides,
  };
}

function createReview(
  overrides: Partial<DepositReviewGroup> & {
    status?: DepositReviewGroup['status'];
  } = {},
): DepositReviewGroup {
  const status = overrides.status ?? 'passed';
  const metadata = {
    chainId: 8453,
    walletAddress: WALLET,
    calls: [createCall(), createCall({ index: 1, method: 'approve' })],
    assetChanges: [],
    approvals: [],
    contracts: [],
    blockNumber: 12_345_678,
    callGas: '210000',
    simulationIds: ['sim-1'],
    shareUrls: [] as string[],
    simulationFingerprint: HASH_A,
    riskHash: HASH_B,
    groupId: 'group-1',
    groupFingerprint: HASH_C,
    batchFingerprint: HASH_D,
    reviewedAt: 1_800_000_000_000,
    expiresAt: 1_800_000_060_000,
    expectedSimulationFingerprint: HASH_A,
    expectedRiskHash: HASH_B,
    blocked: false,
    executionAllowed: true,
    requiresRiskAcknowledgement: false,
  };

  const statusFields =
    status === 'failed'
      ? { status, failureReason: 'Simulation reverted' }
      : status === 'unavailable'
        ? { status, unavailableReason: 'Tenderly timed out' }
        : { status, warnings: [] };

  return {
    ...metadata,
    ...statusFields,
    ...overrides,
  } as DepositReviewGroup;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(Linking.openURL).mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function toggleButton(): HTMLButtonElement {
  const button =
    container.querySelector<HTMLButtonElement>(
      '[aria-label="Show Tenderly verification details"]',
    ) ??
    container.querySelector<HTMLButtonElement>(
      '[aria-label="Hide Tenderly verification details"]',
    );
  if (!button) throw new Error('toggle button not found');
  return button;
}

describe('SimulationTenderlyEvidence', () => {
  it('renders collapsed by default with the summary row only', async () => {
    const review = createReview();

    await act(async () =>
      root.render(<SimulationTenderlyEvidence review={review} />),
    );

    expect(container.textContent).toContain('Verified by Tenderly');
    expect(container.textContent).toContain('Base');
    expect(container.textContent).toContain('2 calls');

    expect(container.textContent).not.toContain('Deposit For');
    expect(container.textContent).not.toContain('Block');
    expect(container.textContent).not.toContain('Call gas');
    expect(
      container.querySelector('[aria-label*="View simulation"]'),
    ).toBeNull();
  });

  it('expands to show block, call gas, and one row per call on tap', async () => {
    const review = createReview();

    await act(async () =>
      root.render(<SimulationTenderlyEvidence review={review} />),
    );
    await act(async () => toggleButton().click());

    expect(container.textContent).toContain('Block');
    expect(container.textContent).toContain('12,345,678');
    expect(container.textContent).toContain('Call gas');
    expect(container.textContent).toContain('210,000');
    expect(container.textContent).toContain('Deposit For');
    expect(container.textContent).toContain('0x3333...3333');
  });

  it('shows "Simulation failed" for a failed review', async () => {
    const review = createReview({ status: 'failed' });

    await act(async () =>
      root.render(<SimulationTenderlyEvidence review={review} />),
    );

    expect(container.textContent).toContain('Simulation failed');
  });

  it('shows "Simulation unavailable" for an unavailable review', async () => {
    const review = createReview({ status: 'unavailable' });

    await act(async () =>
      root.render(<SimulationTenderlyEvidence review={review} />),
    );

    expect(container.textContent).toContain('Simulation unavailable');
  });

  it('omits the public simulation results section when shareUrls is empty', async () => {
    const review = createReview({ shareUrls: [] });

    await act(async () =>
      root.render(<SimulationTenderlyEvidence review={review} />),
    );
    await act(async () => toggleButton().click());

    expect(container.textContent).not.toContain('Public simulation results');
  });

  it('shows one labelled link per shareUrl and opens it via Linking.openURL', async () => {
    const urls = [
      'https://dashboard.tenderly.co/public/simulation/one',
      'https://dashboard.tenderly.co/public/simulation/two',
    ];
    const review = createReview({ shareUrls: urls });

    await act(async () =>
      root.render(<SimulationTenderlyEvidence review={review} />),
    );
    await act(async () => toggleButton().click());

    expect(container.textContent).toContain('Public simulation results');

    const first = container.querySelector<HTMLButtonElement>(
      '[aria-label="View simulation 1 on Tenderly"]',
    );
    const second = container.querySelector<HTMLButtonElement>(
      '[aria-label="View simulation 2 on Tenderly"]',
    );
    expect(first?.textContent).toContain('Result 1 · Tenderly');
    expect(second?.textContent).toContain('Result 2 · Tenderly');

    await act(async () => first?.click());
    expect(Linking.openURL).toHaveBeenCalledWith(urls[0]);

    await act(async () => second?.click());
    expect(Linking.openURL).toHaveBeenCalledWith(urls[1]);
  });

  it('collapses again when the toggle is tapped a second time', async () => {
    const review = createReview();

    await act(async () =>
      root.render(<SimulationTenderlyEvidence review={review} />),
    );
    await act(async () => toggleButton().click());
    expect(container.textContent).toContain('Block');

    await act(async () => toggleButton().click());
    expect(container.textContent).not.toContain('Block');
    expect(container.textContent).not.toContain('Call gas');
    expect(container.textContent).not.toContain('Deposit For');
  });
});

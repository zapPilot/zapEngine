// @vitest-environment jsdom

import type {
  DepositReviewGroup,
  PrivySimulationApproval,
  PrivySimulationAssetChange,
  PrivySimulationContract,
  PrivySimulationToken,
} from '@zapengine/types/api';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SimulationReviewBody } from '@/components/invest/simulation/SimulationReviewBody';
import type { RouteProtocolContext } from '@/integration/simulationPreviewModel';

vi.mock('react-native', () => ({
  Text: ({ children, ...rest }: { children?: ReactNode }) => (
    <span {...rest}>{children}</span>
  ),
  View: ({ children, ...rest }: { children?: ReactNode }) => (
    <div {...rest}>{children}</div>
  ),
  Image: (props: Record<string, unknown>) => <img {...props} alt="" />,
  Linking: { openURL: vi.fn() },
}));

vi.mock('react-native-svg', () => ({
  default: ({ children }: { children?: ReactNode }) => <svg>{children}</svg>,
  Path: () => <path />,
}));

vi.mock('lucide-react-native', () => ({
  CloudOff: () => null,
  XCircle: () => null,
  ArrowDownLeft: () => null,
  ArrowUpRight: () => null,
  ShieldCheck: () => null,
  ChevronDown: () => null,
  ExternalLink: () => null,
  CheckCircle2: () => null,
  CircleDashed: () => null,
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

/** Builds a syntactically valid 0x-prefixed hex string of the given length. */
function hex(char: string, length: number): string {
  return `0x${char.repeat(length)}`;
}

function address(char: string): string {
  return hex(char, 40);
}

function fingerprint(char: string): string {
  return hex(char, 64);
}

function token(
  overrides: Partial<PrivySimulationToken> = {},
): PrivySimulationToken {
  return {
    address: address('1'),
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoUrl: null,
    ...overrides,
  };
}

function assetChange(
  overrides: Partial<PrivySimulationAssetChange> = {},
): PrivySimulationAssetChange {
  return {
    callIndex: 0,
    direction: 'out',
    type: 'erc20',
    from: address('2'),
    to: address('3'),
    token: token(),
    rawAmount: '1000000',
    amount: '1',
    ...overrides,
  };
}

function approval(
  overrides: Partial<PrivySimulationApproval> = {},
): PrivySimulationApproval {
  return {
    callIndex: 0,
    owner: address('2'),
    spender: address('4'),
    token: token(),
    rawAmount: '1000000',
    amount: '1',
    unlimited: false,
    simulatedSpendRaw: '1000000',
    exceedsSimulatedSpend: false,
    ...overrides,
  };
}

function contract(
  overrides: Partial<PrivySimulationContract> = {},
): PrivySimulationContract {
  return {
    address: address('4'),
    name: 'Router Contract',
    verified: true,
    callIndexes: [0],
    ...overrides,
  };
}

/** Fields shared by every DepositReviewGroup status branch. */
type SharedReviewFields = Omit<
  Extract<DepositReviewGroup, { status: 'passed' }>,
  'status' | 'warnings'
>;

function sharedFields(
  overrides: Partial<SharedReviewFields> = {},
): SharedReviewFields {
  return {
    chainId: 42161,
    walletAddress: address('5'),
    calls: [],
    assetChanges: [assetChange()],
    approvals: [approval()],
    contracts: [contract()],
    blockNumber: 250_000_000,
    callGas: '210000',
    simulationIds: ['sim-1'],
    shareUrls: ['https://dashboard.tenderly.co/shared/sim-1'],
    simulationFingerprint: fingerprint('e'),
    riskHash: fingerprint('f'),
    groupId: 'group-arbitrum-gmx',
    groupFingerprint: fingerprint('a'),
    batchFingerprint: fingerprint('b'),
    reviewedAt: 1_700_000_000_000,
    expiresAt: 1_700_000_300_000,
    expectedSimulationFingerprint: fingerprint('c'),
    expectedRiskHash: fingerprint('d'),
    blocked: false,
    executionAllowed: true,
    requiresRiskAcknowledgement: false,
    ...overrides,
  };
}

function passedReview(
  overrides: Partial<SharedReviewFields> = {},
): DepositReviewGroup {
  return { ...sharedFields(overrides), status: 'passed', warnings: [] };
}

function warningReview(
  warnings: Extract<DepositReviewGroup, { status: 'warning' }>['warnings'],
  overrides: Partial<SharedReviewFields> = {},
): DepositReviewGroup {
  return { ...sharedFields(overrides), status: 'warning', warnings };
}

function failedReview(
  failureReason: string,
  overrides: Partial<SharedReviewFields> = {},
): DepositReviewGroup {
  return {
    ...sharedFields(overrides),
    status: 'failed',
    warnings: [],
    failureReason,
  };
}

function unavailableReview(
  unavailableReason: string,
  overrides: Partial<SharedReviewFields> = {},
): DepositReviewGroup {
  return {
    ...sharedFields(overrides),
    status: 'unavailable',
    warnings: [],
    unavailableReason,
  };
}

// Two allocations from the same Arbitrum GMX execution group, each keeping
// its own chip rather than being merged into a single label.
const GMX_PROTOCOLS: RouteProtocolContext[] = [
  { id: 'alloc-btc', label: 'GMX BTC/USDC', badge: '60%' },
  { id: 'alloc-eth', label: 'GMX ETH/USDC', badge: '40%' },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(
  review: DepositReviewGroup,
  protocols: readonly RouteProtocolContext[],
) {
  await act(async () =>
    root.render(<SimulationReviewBody protocols={protocols} review={review} />),
  );
}

describe('SimulationReviewBody', () => {
  it('renders the chain chip plus one chip per protocol entry', async () => {
    await render(passedReview(), GMX_PROTOCOLS);

    expect(container.textContent).toContain('Arbitrum');

    const btcLabel = Array.from(container.querySelectorAll('span')).find(
      (node) => node.textContent === 'GMX BTC/USDC',
    );
    const ethLabel = Array.from(container.querySelectorAll('span')).find(
      (node) => node.textContent === 'GMX ETH/USDC',
    );
    expect(btcLabel).toBeDefined();
    expect(ethLabel).toBeDefined();

    // Each protocol renders in its own chip container, not merged into one.
    const btcChip = btcLabel?.closest('div');
    const ethChip = ethLabel?.closest('div');
    expect(btcChip).not.toBe(ethChip);
    expect(btcChip?.textContent).not.toContain('GMX ETH/USDC');
    expect(ethChip?.textContent).not.toContain('GMX BTC/USDC');
  });

  it('renders only the chain chip and nothing throws when protocols is empty', async () => {
    await expect(render(passedReview(), [])).resolves.not.toThrow();

    expect(container.textContent).toContain('Arbitrum');
    expect(container.textContent).not.toContain('GMX');
  });

  it('shows the blocking banner and failure reason for a failed status', async () => {
    const review = failedReview('Router call reverted: insufficient liquidity');

    await render(review, GMX_PROTOCOLS);

    expect(container.textContent).toContain('This transaction would revert');
    expect(container.textContent).toContain(
      'Router call reverted: insufficient liquidity',
    );
  });

  it('shows the blocking banner and unavailable reason for an unavailable status', async () => {
    const review = unavailableReview('Tenderly did not respond in time');

    await render(review, GMX_PROTOCOLS);

    expect(container.textContent).toContain(
      'We could not verify this transaction',
    );
    expect(container.textContent).toContain('Tenderly did not respond in time');
  });

  it('renders no blocking banner for a passed status', async () => {
    await render(passedReview(), GMX_PROTOCOLS);

    expect(container.textContent).not.toContain(
      'This transaction would revert',
    );
    expect(container.textContent).not.toContain(
      'We could not verify this transaction',
    );
  });

  it('renders no blocking banner for a warning status', async () => {
    const review = warningReview([
      {
        code: 'UNLIMITED_APPROVAL',
        message: 'Unlimited approval granted',
        callIndex: 0,
      },
    ]);

    await render(review, GMX_PROTOCOLS);

    expect(container.textContent).not.toContain(
      'This transaction would revert',
    );
    expect(container.textContent).not.toContain(
      'We could not verify this transaction',
    );
  });

  it.each<DepositReviewGroup>([
    passedReview(),
    warningReview([
      { code: 'UNDECODED_METHOD', message: 'Unknown method', callIndex: 0 },
    ]),
    failedReview('It reverted'),
    unavailableReview('No data'),
  ])(
    'never renders the removed wallet/verdict metadata card (status=$status)',
    async (review) => {
      await render(review, GMX_PROTOCOLS);

      expect(container.textContent).not.toContain('All checks passed');
      expect(container.textContent).not.toContain('Simulation ready');
      expect(container.textContent).not.toContain('Wallet ·');
      expect(container.textContent).not.toContain('Group ');
    },
  );

  it('renders the merged route-flow section and a collapsed Tenderly evidence toggle', async () => {
    await render(passedReview(), GMX_PROTOCOLS);

    expect(container.textContent).toContain('You send');
    expect(container.textContent).toContain('You receive');

    // Collapsed by default: the expanded-only "Block" detail must not appear.
    expect(container.textContent).not.toContain('Block');

    const toggle = container.querySelector<HTMLButtonElement>(
      '[aria-label="Show Tenderly verification details"]',
    );
    expect(toggle).not.toBeNull();
  });
});

// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { Linking } from 'react-native';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentTimeline } from '@/components/aiWallet/AgentTimeline';
import type { AgentTransaction } from '@/integration/agentActivity';

import { agentRunStatus, RUN_DEPOSIT_HASH } from './support/agentRunStatus';

interface NativeProps {
  children?: ReactNode;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  accessibilityState?: { expanded?: boolean };
  onPress?: () => void;
}

vi.mock('react-native', () => ({
  Text: ({ children }: NativeProps) => <span>{children}</span>,
  View: ({ children, accessibilityLabel }: NativeProps) => (
    <div aria-label={accessibilityLabel}>{children}</div>
  ),
  ActivityIndicator: ({ accessibilityLabel }: NativeProps) => (
    <div role="progressbar" aria-label={accessibilityLabel} />
  ),
  Linking: { openURL: vi.fn() },
}));
vi.mock('lucide-react-native', () => {
  const Icon = () => null;
  return {
    ChartNoAxesColumnIncreasing: Icon,
    Check: Icon,
    ChevronDown: Icon,
    ExternalLink: Icon,
    FileText: Icon,
    Layers: Icon,
    Sparkle: Icon,
    SquarePlay: Icon,
    Wallet: Icon,
    X: Icon,
  };
});
vi.mock('@/components/aiWallet/PulseDot', () => ({
  PulseDot: () => <span data-testid="pulse" />,
}));
vi.mock('@/components/token/ChainMark', () => ({ ChainMark: () => null }));
// Every Tap is a <button>, links included, so nesting any two shows up.
vi.mock('@/components/ui/Tap', () => ({
  Tap: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    onPress,
  }: NativeProps) => (
    <button
      type="button"
      role={accessibilityRole === 'link' ? 'link' : undefined}
      aria-label={accessibilityLabel}
      aria-expanded={accessibilityState?.expanded}
      onClick={onPress}
    >
      {children}
    </button>
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const swap = { kind: 'swap', index: 3, total: 5 } as const;
const tenderly = 'https://dashboard.tenderly.co/shared/simulation/1';
const latestDeposit: AgentTransaction = {
  hash: `0x${'ab'.repeat(32)}`,
  kind: 'deposit',
  status: 'ok',
  timestampMs: Date.UTC(2026, 8, 26, 4, 41, 27),
};
const running = agentRunStatus({
  activeStep: 'sign',
  transaction: swap,
  depositHash: RUN_DEPOSIT_HASH,
  steps: {
    intent: {
      state: 'done',
      entries: [
        { text: 'Review warning', link: null },
        {
          text: 'Tenderly simulation 1/1',
          link: { label: 'Tenderly', url: tenderly },
        },
      ],
    },
    sign: {
      state: 'active',
      entries: [
        { text: 'Re-checking the guard before signing the swap', link: null },
      ],
    },
  },
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  vi.mocked(Linking.openURL).mockClear();
});

async function render(props: Partial<Parameters<typeof AgentTimeline>[0]>) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <AgentTimeline
        run={null}
        playback={null}
        latestDeposit={latestDeposit}
        awaitingFirstAction={false}
        stretch={false}
        {...props}
      />,
    );
  });
  return container;
}

function stepButton(view: HTMLElement, label: string) {
  const button = [...view.querySelectorAll('button[aria-expanded]')].find(
    (candidate) => candidate.textContent?.startsWith(label),
  );
  if (!button) throw new Error(`Missing step ${label}`);
  return button as HTMLButtonElement;
}

async function click(element: Element) {
  await act(async () => (element as HTMLElement).click());
}

describe('AgentTimeline', () => {
  it('never nests one pressable inside another', async () => {
    const view = await render({ run: running });
    for (const button of view.querySelectorAll('button[aria-expanded]')) {
      await click(button);
    }
    expect(view.querySelector('button[aria-expanded="false"]')).toBeNull();
    expect(view.querySelector('button button')).toBeNull();
  });

  it('opens and closes steps independently', async () => {
    const view = await render({ run: running });
    const intent = stepButton(view, 'Agent intent');
    const confirm = stepButton(view, 'Confirmed on Base');
    expect(intent.getAttribute('aria-expanded')).toBe('false');
    expect(view.textContent).not.toContain('plan-orchestration builds');

    await click(intent);
    await click(confirm);
    expect(intent.getAttribute('aria-expanded')).toBe('true');
    expect(confirm.getAttribute('aria-expanded')).toBe('true');
    expect(view.textContent).toContain('plan-orchestration builds the plan');
    expect(view.textContent).toContain('Tenderly simulation 1/1');

    await click(intent);
    expect(intent.getAttribute('aria-expanded')).toBe('false');
    expect(view.textContent).not.toContain('plan-orchestration builds');
    expect(view.textContent).toContain('final deposit is also looked up');
  });

  it('opens a run entry link from its chip', async () => {
    const view = await render({ run: running });
    await click(stepButton(view, 'Agent intent'));
    const chip = view.querySelector(
      '[role="link"][aria-label="Tenderly: Tenderly simulation 1/1"]',
    );
    expect(chip).not.toBeNull();
    await click(chip!);
    expect(Linking.openURL).toHaveBeenCalledWith(tenderly);
  });

  it('shows a spinner and the live line on the step a run is on', async () => {
    const view = await render({ run: running });
    const progress = view.querySelectorAll('[role="progressbar"]');
    expect(progress).toHaveLength(1);
    expect(progress[0]?.getAttribute('aria-label')).toBe('Step 5 in progress');
    expect(stepButton(view, 'Wallet signs locally').textContent).toContain(
      'Tx 3/5 · swap — Re-checking the guard before signing the swap',
    );
    expect(view.querySelector('[data-testid="pulse"]')).toBeNull();
  });

  it('pulses during a replay without run lines', async () => {
    const view = await render({
      run: running,
      playback: { mode: 'replay', index: 2 },
    });
    // A run in progress still wins over the replay.
    expect(view.querySelectorAll('[role="progressbar"]')).toHaveLength(1);

    await act(async () => root!.unmount());
    const replay = await render({ playback: { mode: 'replay', index: 2 } });
    expect(replay.querySelector('[role="progressbar"]')).toBeNull();
    expect(replay.querySelectorAll('[data-testid="pulse"]')).toHaveLength(1);
    expect(replay.textContent).not.toContain('Tx 3/5');
  });

  it('marks the failed step and shows the run error under it', async () => {
    const failed = agentRunStatus({
      state: 'failed',
      finishedAt: 2_000,
      error: 'Error: swap reverted on-chain',
      transaction: swap,
      steps: {
        news: { state: 'done', entries: [] },
        analyze: { state: 'done', entries: [] },
        intent: { state: 'done', entries: [] },
        compose: { state: 'done', entries: [] },
        sign: { state: 'done', entries: [] },
        confirm: { state: 'failed', entries: [] },
      },
    });
    const view = await render({ run: failed });
    expect(view.querySelector('[aria-label="Step 6 failed"]')).not.toBeNull();
    expect(stepButton(view, 'Confirmed on Base').textContent).toContain(
      'Tx 3/5 · swap — Error: swap reverted on-chain',
    );
    expect(view.querySelector('[role="progressbar"]')).toBeNull();
    await click(stepButton(view, 'Confirmed on Base'));
    const panelText = [...view.querySelectorAll('span')].map(
      (span) => span.textContent,
    );
    // The full error, beyond the truncated live line.
    expect(panelText).toContain('Error: swap reverted on-chain');
  });

  it("links a run's deposit and waits for Blockscout before showing its time", async () => {
    const view = await render({ run: running });
    const link = view.querySelector(
      `[aria-label="View this run's deposit on Basescan"]`,
    );
    await click(link!);
    expect(Linking.openURL).toHaveBeenCalledWith(
      `https://basescan.org/tx/${RUN_DEPOSIT_HASH}`,
    );
    expect(link!.textContent).toBe('');

    await act(async () => root!.unmount());
    const delivering = agentRunStatus({
      activeStep: 'deliver',
      depositHash: RUN_DEPOSIT_HASH,
    });
    const other = await render({ run: delivering });
    expect(
      other.querySelector(`[aria-label="View this run's deposit on Basescan"]`)
        ?.textContent,
    ).toBe('');
    await act(async () => root!.unmount());
    const seen = await render({
      run: delivering,
      latestDeposit: { ...latestDeposit, hash: RUN_DEPOSIT_HASH },
    });
    expect(
      seen.querySelector(`[aria-label="View this run's deposit on Basescan"]`)
        ?.textContent,
    ).toMatch(/^\d{2}:\d{2}:27$/);
  });

  it('shows the latest deposit when there is no local run', async () => {
    const view = await render({});
    const header = view.querySelector(
      '[aria-label="View the confirmed deposit on Basescan"]',
    );
    expect(header?.textContent).toMatch(/^\d{2}:\d{2}:27$/);
    await click(stepButton(view, 'Confirmed on Base'));
    const chip = view.querySelector(
      `[aria-label="Latest deposit on Basescan: The agent's latest confirmed deposit"]`,
    );
    await click(chip!);
    expect(Linking.openURL).toHaveBeenCalledWith(
      `https://basescan.org/tx/${latestDeposit.hash}`,
    );
    expect(view.querySelector('[role="progressbar"]')).toBeNull();
  });
});

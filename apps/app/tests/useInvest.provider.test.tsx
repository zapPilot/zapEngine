// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BASE_DEPOSIT_TOKENS } from '@/integration/depositTokens';
import type { StageDraft } from '@/integration/investTargetsModel';
import {
  InvestProvider,
  useInvest,
  type InvestContextValue,
} from '@/integration/useInvest';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const draft: StageDraft = {
  positionId: 'morpho-base',
  weightBps: 10_000,
  usd6: '40000000',
  sourceToken: BASE_DEPOSIT_TOKENS[0],
  fromAmount: '40000000',
};

interface Harness {
  root: Root;
  container: HTMLDivElement;
  current(): InvestContextValue;
}

let active: Harness | null = null;

function Probe({ onValue }: { onValue: (value: InvestContextValue) => void }) {
  onValue(useInvest());
  return null;
}

async function render(): Promise<Harness> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let value: InvestContextValue | null = null;

  await act(async () => {
    root.render(
      createElement(
        InvestProvider,
        null,
        createElement(Probe, { onValue: (next) => (value = next) }),
      ),
    );
    await Promise.resolve();
  });

  const harness: Harness = {
    root,
    container,
    current: () => {
      if (!value) throw new Error('InvestProvider did not render');
      return value;
    },
  };
  active = harness;
  return harness;
}

beforeEach(() => {
  active = null;
});

afterEach(async () => {
  if (!active) return;
  await act(async () => {
    active?.root.unmount();
  });
  active.container.remove();
  active = null;
});

describe('InvestProvider', () => {
  it('starts on the default sector 40/60/0 mix with nothing frozen', async () => {
    const harness = await render();

    expect(
      harness
        .current()
        .targetAllocations.map((entry) => [entry.positionId, entry.weightBps]),
    ).toEqual([
      ['morpho-base', 3_600],
      ['gmx-arbitrum', 4_000],
      ['hlp', 2_400],
    ]);
    expect(harness.current().stageDrafts).toEqual([]);
    expect(harness.current().totalUsd6).toBe('0');
  });

  it('drops frozen stages and the HLP baseline when a weight changes', async () => {
    const harness = await render();

    await act(async () => {
      harness.current().setStageDrafts([draft]);
      harness.current().setHlpBaselineUsd6('1000000');
    });
    expect(harness.current().stageDrafts).toEqual([draft]);

    await act(async () => {
      harness.current().setSectorWeight('stable', 0);
    });

    expect(harness.current().stageDrafts).toEqual([]);
    expect(harness.current().hlpBaselineUsd6).toBeNull();
    expect(
      harness
        .current()
        .targetAllocations.find((entry) => entry.positionId === 'hlp')
        ?.weightBps,
    ).toBe(0);
  });

  it('drops the HyperCore spot draft when the amount changes', async () => {
    const harness = await render();

    await act(async () => {
      harness.current().setHyperCoreFundingDraft({
        source: 'hypercore-spot',
        requestedUsd6: '10000000',
      });
    });
    expect(harness.current().hyperCoreFundingDraft).not.toBeNull();

    await act(async () => {
      harness.current().setAmountInput('40');
    });

    expect(harness.current().hyperCoreFundingDraft).toBeNull();
    expect(harness.current().totalUsd6).toBe('40000000');
    expect(harness.current().amountUsd).toBe(40);
  });

  it('clears frozen execution for overrides and locked-sector edits, and preserves overrides on reset', async () => {
    const harness = await render();
    for (const edit of [
      () => harness.current().setFundingOverride('hlp', BASE_DEPOSIT_TOKENS[1]),
      () => harness.current().setSectorWeight('sp500', 5000),
      () => harness.current().clearFundingOverrides(),
    ]) {
      await act(async () => {
        harness.current().setStageDrafts([draft]);
        harness.current().setHlpBaselineUsd6('1');
        harness.current().setHyperCoreFundingDraft({
          source: 'hypercore-spot',
          requestedUsd6: '10',
        });
      });
      await act(async () => {
        edit();
      });
      expect(harness.current().stageDrafts).toEqual([]);
      expect(harness.current().hlpBaselineUsd6).toBeNull();
      expect(harness.current().hyperCoreFundingDraft).toBeNull();
      expect(harness.current().sectorWeights.sp500).toBe(0);
    }
    await act(async () => {
      harness.current().setFundingOverride('hlp', BASE_DEPOSIT_TOKENS[1]);
      harness.current().resetSectorWeights();
    });
    expect(harness.current().fundingOverrides.hlp).toBe(BASE_DEPOSIT_TOKENS[1]);
    await act(async () => {
      harness.current().setFundingOverride('hlp', null);
    });
    expect(harness.current().fundingOverrides).toEqual({});
  });

  it('restores the default mix and clears frozen stages on reset', async () => {
    const harness = await render();

    await act(async () => {
      harness.current().setSectorWeight('stable', 0);
      harness.current().setStageDrafts([draft]);
    });

    await act(async () => {
      harness.current().resetSectorWeights();
    });

    expect(
      harness
        .current()
        .targetAllocations.find((entry) => entry.positionId === 'hlp')
        ?.weightBps,
    ).toBe(2_400);
    expect(harness.current().stageDrafts).toEqual([]);
  });
});

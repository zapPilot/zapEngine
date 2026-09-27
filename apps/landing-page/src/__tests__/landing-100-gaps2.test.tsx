import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DailySnapshot } from '@zapengine/types/strategy';
import { ChartHoverLayer } from '@/components/track-record/ChartHoverLayer.client';
import { deriveEventsFromSnapshots } from '@/data/track-record-events';
import { verifyPerformanceMetrics } from '@/data/track-record-accessor';

function snap(
  date: string,
  nav: string,
  perf: Partial<DailySnapshot['performance']> = {},
): DailySnapshot {
  return {
    schemaVersion: '1',
    strategyId: 'strategy',
    strategyVersion: 'v1',
    date,
    timestamp: `${date}T00:00:00.000Z`,
    chainIds: [1],
    walletAddresses: [],
    previousCid: null,
    nav: { usd: nav },
    performance: {
      dailyReturn: '0.00%',
      cumulativeReturn: '0.00%',
      maxDrawdown: '0.00%',
      volatility30d: '0.00%',
      sharpe: '0',
      sortino: '0',
      ...perf,
    },
    positions: [],
    costs: {
      gasUsd: '0',
      slippageUsd: '0',
      protocolFeesUsd: '0',
      totalUsd: '0',
    },
    transactions: [],
    benchmarks: [],
  } as DailySnapshot;
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('hover layer null previous', () => {
  it('handles arrows before focus and shift past the last event', () => {
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue(
      {
        left: 0,
        width: 500,
        top: 0,
        height: 200,
        right: 500,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      },
    );
    render(
      <ChartHoverLayer
        total={5}
        ariaLabel="x"
        labelForIndex={(i) => `d${i}`}
        rowsForIndex={() => []}
        markers={[
          { index: 1, y: 10, asset: 'BTC', action: 'buy', label: 'bought' },
        ]}
      >
        <svg data-testid="c" />
      </ChartHoverLayer>,
    );
    const surface = screen.getByRole('slider');
    // No focus first: previous is null so `previous ?? 0` hits its fallback.
    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(surface).toHaveAttribute('aria-valuenow', '1');
    // Jump to end then shift past it: probe passes but indexed lookup misses.
    fireEvent.keyDown(surface, { key: 'End' });
    expect(surface).toHaveAttribute('aria-valuenow', '4');
    fireEvent.keyDown(surface, { key: 'ArrowRight', shiftKey: true });
    expect(surface).toHaveAttribute('aria-valuenow', '4');
  });
});

describe('accessor ratio and window branches', () => {
  function windowSnapshots(perf: Partial<DailySnapshot['performance']>) {
    // Flat 100 NAV: all returns 0, vol 0, mean 0. Stored mismatch only where given.
    return Array.from({ length: 31 }, (_, i) =>
      snap(`2026-05-${String(i + 1).padStart(2, '0')}`, '100', {
        dailyReturn: '0.00%',
        cumulativeReturn: '0.00%',
        maxDrawdown: '0.00%',
        volatility30d: '0.00%',
        sharpe: '0',
        sortino: '0',
        ...perf,
      }),
    );
  }
  it('takes the em-dash early return', () => {
    const r = verifyPerformanceMetrics(
      windowSnapshots({ sharpe: '—', sortino: '—', volatility30d: '' }),
    );
    expect(r.valid).toBe(true);
  });
  it('takes the non-finite ratio fallback', () => {
    const r = verifyPerformanceMetrics(
      windowSnapshots({ sharpe: 'abc', sortino: 'xyz' }),
    );
    expect(r.valid).toBe(true);
  });
  it('passes a clean 30d window without mismatches', () => {
    const r = verifyPerformanceMetrics(windowSnapshots({}));
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });
  it('passes the committed mock history without mismatches', async () => {
    const { mockSnapshotEntries } = await import('@/data/mock-track-record');
    const snapshots = mockSnapshotEntries.map((e) => e.snapshot);
    expect(snapshots.length).toBeGreaterThan(30);
    const r = verifyPerformanceMetrics(snapshots);
    expect(r.errors).toEqual([]);
  });
  it('accepts correct sharpe and sortino on a volatile window', async () => {
    const { mean, annualizedVolatility, annualizedDownsideDeviation } =
      await import('@/data/track-record-accessor');
    const navs = Array.from(
      { length: 31 },
      (_, i) => 100 + (i % 2 === 0 ? i : -i),
    );
    const dates = navs.map(
      (_, i) => `2026-06-${String(i + 1).padStart(2, '0')}`,
    );
    const dailyReturns: number[] = [];
    for (let i = 1; i < navs.length; i += 1) {
      dailyReturns.push(navs[i]! / navs[i - 1]! - 1);
    }
    const rolling = dailyReturns.slice(Math.max(0, dailyReturns.length - 30));
    const vol = annualizedVolatility(rolling);
    const annualMean = mean(rolling) * 252;
    const downside = annualizedDownsideDeviation(rolling);
    expect(vol).toBeGreaterThan(0);
    expect(downside).toBeGreaterThan(0);
    const snapshots = navs.map((nav, i) =>
      snap(dates[i]!, String(nav), {
        dailyReturn: '',
        cumulativeReturn: '',
        maxDrawdown: '',
        volatility30d: i === 30 ? `${(vol * 100).toFixed(2)}%` : '',
        sharpe: i === 30 ? `${(annualMean / vol).toFixed(2)}` : '',
        sortino: i === 30 ? `${(annualMean / downside).toFixed(2)}` : '',
      }),
    );
    const r = verifyPerformanceMetrics(snapshots);
    expect(r.errors).toEqual([]);
  });
});

describe('events small deltas hit nullish fallbacks', () => {
  it('covers missing assets and tie order', () => {
    const base = (date: string, weights: Record<string, number>) =>
      ({
        date,
        transactions: [{ type: 'rebalance' }],
        positions: Object.entries(weights).map(([asset, weight]) => ({
          asset,
          weight: `${weight}%`,
        })),
      }) as unknown as DailySnapshot;
    // Tiny drift under 0.5pp: deltas empty -> classify null -> no event.
    expect(
      deriveEventsFromSnapshots([
        base('2026-01-01', { BTC: 50, ETH: 30, USDC: 20 }),
        base('2026-01-02', { BTC: 50.1, ETH: 30.1, USDC: 19.8 }),
      ]),
    ).toEqual([]);
    // Pure sell: gained empty -> target null.
    const [sell] = deriveEventsFromSnapshots([
      base('2026-01-01', { BTC: 50, ETH: 30, USDC: 20 }),
      base('2026-01-02', { BTC: 10, ETH: 10, USDC: 80 }),
    ]);
    expect(sell?.type).toBe('sell');
    // Rotation with two gainers exercises the reduce tie-break.
    const [rot] = deriveEventsFromSnapshots([
      base('2026-01-01', { BTC: 10, ETH: 10, SPY: 10, USDC: 70 }),
      base('2026-01-02', { BTC: 40, ETH: 30, SPY: 10, USDC: 20 }),
    ]);
    expect(rot?.type).toBe('buy');
    // Partial moves: only BTC crosses the threshold so ETH/SPY hit `?? 0`.
    const [partial] = deriveEventsFromSnapshots([
      base('2026-01-01', { BTC: 50, ETH: 30, SPY: 10, USDC: 10 }),
      base('2026-01-02', { BTC: 60, ETH: 30.1, SPY: 10.1, USDC: 0 }),
    ]);
    expect(partial?.type).toBe('buy');
  });
});

describe('cta company fallback and unmount focus', () => {
  it('submits when company field is missing and unmounts while open', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true } as Response);
    const { AppCtaLink } = await import('@/components/landing-v2/AppCtaLink');
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
    const { unmount } = render(
      <AppCtaLink className="cta" location="hero">
        Join waitlist
      </AppCtaLink>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Join waitlist' }));
    const dialog = screen.getByRole('dialog');
    // Remove both names so `?? ''` hits both fallbacks.
    screen.getByPlaceholderText('you@example.com').removeAttribute('name');
    const company = dialog.querySelector('input[name="company"]');
    company?.removeAttribute('name');
    fireEvent.submit(
      screen.getByPlaceholderText('you@example.com').closest('form')!,
    );
    expect(await screen.findByText('You’re on the list ✓')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
    // Unmount while open: cleanup runs with a detached trigger.
    unmount();
  });
});

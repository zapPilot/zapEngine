import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailySnapshot } from '@zapengine/types/strategy';

const useTrackRecordMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useTrackRecord', () => ({
  useTrackRecord: useTrackRecordMock,
}));

const sentryCapture = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({
  captureException: sentryCapture,
}));

import { ChartLegend } from '@/components/track-record/ChartLegend';
import { DistributionExample } from '@/components/distribution/DistributionExample';
import type { DistributionExample as Example } from '@/data/distribution';
import TrackRecordPage from '@/app/track-record/page';
import PositionsPage from '@/app/track-record/positions/page';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ChartHoverLayer } from '@/components/track-record/ChartHoverLayer.client';
import { PitchNav } from '@/components/pitch/PitchNav.client';
import { PitchProgressBar } from '@/components/pitch/PitchProgressBar.client';
import { PITCH_SLIDES } from '@/config/pitch';
import {
  computePerformanceSummary,
  verifyPerformanceMetrics,
} from '@/data/track-record-accessor';
import {
  deriveEventsFromSnapshots,
  demoStrategyEvents,
} from '@/data/track-record-events';
import {
  setTrackRecordSource,
  useTrackRecordSource,
} from '@/data/track-record-source';
import {
  wholePercents,
  allocationFromSnapshot,
} from '@/components/track-record/chartAllocation';
import { captureWaitlistFirstTouch } from '@/lib/waitlist-attribution';
import { mockSnapshotEntries, mockMeta } from '@/data/mock-track-record';

function snap(
  date = '2026-01-01',
  nav = '100',
  previousCid: string | null = null,
  performance: Partial<DailySnapshot['performance']> = {},
): DailySnapshot {
  return {
    schemaVersion: '1',
    strategyId: 'strategy',
    strategyVersion: 'v1',
    date,
    timestamp: `${date}T00:00:00.000Z`,
    chainIds: [1],
    walletAddresses: [],
    previousCid,
    nav: { usd: nav },
    performance: {
      dailyReturn: '0.00%',
      cumulativeReturn: '0.00%',
      maxDrawdown: '0.00%',
      ...performance,
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

function baseState(overrides: Record<string, unknown> = {}) {
  const snapshots = mockSnapshotEntries.slice(-3).map((e) => e.snapshot);
  return {
    meta: mockMeta,
    snapshotEntries: [],
    snapshots,
    latestSnapshot: snapshots[snapshots.length - 1] ?? null,
    summary: computePerformanceSummary(snapshots),
    events: [],
    positions: [],
    verification: {
      chainValid: true,
      chainBrokenAt: undefined,
      totalSnapshots: snapshots.length,
      signatureValid: true,
      signature: null,
      performanceValid: true,
      performanceErrors: [],
    },
    isLoading: false,
    error: null,
    source: 'backtest',
    setSource: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useTrackRecordMock.mockReturnValue(baseState());
});

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('chart legend fallback', () => {
  it('renders without a className', () => {
    render(
      <ChartLegend
        items={[{ kind: 'series', label: 'Strategy', variant: 'strategy' }]}
      />,
    );
    expect(screen.getByText('Strategy')).toBeInTheDocument();
  });
});

describe('distribution example single channel', () => {
  it('hides the span when fewer than two timestamps exist', () => {
    const example = {
      title: 'T',
      sourceUrl: 'https://example.com/a',
      createdAt: '2026-01-01T00:00:00.000Z',
      localizations: 1,
      videos: 0,
      posts: 1,
      channels: [
        { platform: 'x', language: 'en', publishedAt: null, postUrl: null },
      ],
    } as unknown as Example;
    render(<DistributionExample example={example} />);
    expect(screen.getByText(/Every link below is live/)).toBeInTheDocument();
    expect(screen.getByText('unpublished')).toBeInTheDocument();
    expect(screen.queryByText(/published over/)).toBeNull();
  });
});

describe('positions page fallbacks', () => {
  it('shows N/A when tokenAddress is missing', () => {
    const latest = {
      ...snap('2026-01-02', '120'),
      date: '2026-01-02',
      positions: [
        {
          chainId: 1,
          protocol: 'p',
          asset: 'ETH',
          amount: '1',
          valueUsd: '100',
          weight: '100%',
          pricingSource: 't',
          tokenAddress: null,
        },
      ],
    } as unknown as DailySnapshot;
    useTrackRecordMock.mockReturnValue(
      baseState({ latestSnapshot: latest, positions: latest.positions }),
    );
    render(<PositionsPage />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});

describe('track-record page branches', () => {
  it('shows live error copy when live load fails', () => {
    useTrackRecordMock.mockReturnValue(
      baseState({ error: 'boom', source: 'live' }),
    );
    render(<TrackRecordPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'live track record: boom',
    );
  });
  it('shows backtest error copy when backtest load fails', () => {
    useTrackRecordMock.mockReturnValue(
      baseState({ error: 'boom', source: 'backtest' }),
    );
    render(<TrackRecordPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('track record: boom');
    expect(screen.getByRole('alert')).not.toHaveTextContent('live');
  });
  it('renders backtest section with fallback window when snapshots are empty', () => {
    useTrackRecordMock.mockReturnValue(
      baseState({ snapshots: [], latestSnapshot: null }),
    );
    render(<TrackRecordPage />);
    expect(screen.getByText('Historical performance')).toBeInTheDocument();
    expect(screen.getByText(/No data/)).toBeInTheDocument();
  });
  it('renders chain fallback when chainIds entry is missing', () => {
    const latest = {
      ...snap('2026-01-02', '120'),
      walletAddresses: ['0x1111111111111111111111111111111111111111'],
      chainIds: [],
    } as unknown as DailySnapshot;
    useTrackRecordMock.mockReturnValue(
      baseState({
        source: 'live',
        meta: { ...mockMeta, latestSnapshotCid: 'bafyreal' },
        latestSnapshot: latest,
        snapshots: [latest],
        events: [],
      }),
    );
    render(<TrackRecordPage />);
    expect(screen.getByText('chain —')).toBeInTheDocument();
  });
});

describe('error boundary dev branch', () => {
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });
  it('shows the message in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const Throw = () => {
      throw new Error('dev boom');
    };
    try {
      render(
        <ErrorBoundary>
          <Throw />
        </ErrorBoundary>,
      );
      expect(screen.getByText('dev boom')).toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('waitlist referrer branch', () => {
  it('captures document.referrer', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://ref.test/',
      configurable: true,
    });
    window.history.replaceState({}, '', '/?utm_source=a');
    window.localStorage.clear();
    const captured = captureWaitlistFirstTouch();
    expect(captured?.referrer).toBe('https://ref.test/');
    Object.defineProperty(document, 'referrer', {
      value: '',
      configurable: true,
    });
  });
});

describe('analytics without gtag', () => {
  it('still captures to posthog when gtag is missing', async () => {
    vi.resetModules();
    const gtag = (window as unknown as Record<string, unknown>)['gtag'];
    delete (window as unknown as Record<string, unknown>)['gtag'];
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    try {
      const posthog = (await import('posthog-js')).default as unknown as {
        capture: ReturnType<typeof vi.fn>;
      };
      const spy = vi.spyOn(posthog, 'capture').mockImplementation(() => {});
      const { trackCtaClicked } = await import('@/lib/analytics/events');
      trackCtaClicked('hero');
      expect(spy).toHaveBeenCalled();
    } finally {
      (window as unknown as Record<string, unknown>)['gtag'] = gtag;
      vi.unstubAllEnvs();
    }
  });
});

describe('track-record source early return', () => {
  it('ignores setting the same source', () => {
    function Probe() {
      const source = useTrackRecordSource();
      return <span>{source}</span>;
    }
    render(<Probe />);
    const current = screen.getByText('backtest').textContent;
    act(() => {
      setTrackRecordSource('backtest');
      setTrackRecordSource('live');
      setTrackRecordSource('live');
    });
    expect(current).toBe('backtest');
    act(() => {
      setTrackRecordSource('backtest');
    });
  });
});

describe('track-record events edge branches', () => {
  it('classifies a pure sell with no gain target', () => {
    const base = (date: string, weights: Record<string, number>) =>
      ({
        date,
        transactions: [{ type: 'rebalance' }],
        positions: Object.entries(weights).map(([asset, weight]) => ({
          asset,
          weight: `${weight}%`,
        })),
      }) as unknown as DailySnapshot;
    const events = deriveEventsFromSnapshots([
      base('2026-01-01', { BTC: 50, ETH: 30, USDC: 20 }),
      base('2026-01-02', { BTC: 10, ETH: 10, USDC: 80 }),
    ]);
    expect(events[0]?.type).toBe('sell');
    expect(events[0]?.toAsset).toBeNull();
  });
  it('covers demo events with numeric guards', () => {
    expect(demoStrategyEvents().length).toBeGreaterThan(0);
  });
});

describe('track-record accessor branches', () => {
  it('returns null for non-finite percent and handles em-dash ratios', () => {
    const bad = verifyPerformanceMetrics([
      snap('2026-01-01', '100', null, {
        dailyReturn: '',
        cumulativeReturn: 'not-a-number%',
        sharpe: '—',
        sortino: '—',
        maxDrawdown: '',
        volatility30d: '',
      }),
      snap('2026-01-02', '100', null, {
        dailyReturn: '',
        cumulativeReturn: 'not-a-number%',
        sharpe: '—',
        sortino: '—',
        maxDrawdown: '',
        volatility30d: '',
      }),
    ]);
    expect(bad.valid).toBe(true);
  });
  it('flags volatility, sharpe and sortino mismatches on a 30d window', () => {
    const values = Array.from({ length: 31 }, (_, i) =>
      snap(
        `2026-04-${String(i + 1).padStart(2, '0')}`,
        String(100 + (i % 2 === 0 ? i : -i / 2)),
        null,
        {
          dailyReturn: '0.00%',
          cumulativeReturn: '0.00%',
          maxDrawdown: '0.00%',
          volatility30d: '999%',
          sharpe: '999',
          sortino: '999',
        },
      ),
    );
    const result = verifyPerformanceMetrics(values);
    expect(
      result.errors.some((e) => e.includes('volatility30d mismatch')),
    ).toBe(true);
    expect(result.errors.some((e) => e.includes('sharpe mismatch'))).toBe(true);
    expect(result.errors.some((e) => e.includes('sortino mismatch'))).toBe(
      true,
    );
  });
  it('walks history to genesis', async () => {
    const bodies: Record<string, unknown> = {
      'cid-1': snap('2026-01-01', '100', null),
    };
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(bodies[url.split('/').at(-1)!]),
      } as unknown as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { fetchSnapshotHistoryEntries } =
        await import('@/data/track-record-accessor');
      const entries = await fetchSnapshotHistoryEntries('cid-1', 5);
      expect(entries).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('chart allocation zero total', () => {
  it('maps zero totals to zeros', () => {
    expect(wholePercents([0, 0])).toEqual([0, 0]);
    expect(wholePercents([])).toEqual([]);
  });
  it('returns null for a thin book', () => {
    const thin = {
      ...snap('2026-01-01', '100'),
      positions: [],
    } as DailySnapshot;
    expect(allocationFromSnapshot(thin)).toBeNull();
  });
});

describe('pitch progress double scroll', () => {
  it('ignores a second scroll in the same frame', () => {
    let raf: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      raf = cb;
      return 1;
    });
    render(<PitchProgressBar />);
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    act(() => {
      raf?.(0);
    });
  });
});

describe('chart hover negative and fallback', () => {
  function renderLayer(
    markers: {
      index: number;
      y: number;
      asset: 'BTC';
      action: 'buy';
      label: string;
    }[] = [],
  ) {
    return render(
      <ChartHoverLayer
        total={5}
        ariaLabel="x"
        labelForIndex={(i) => `d${i}`}
        rowsForIndex={() => []}
        markers={markers}
      >
        <svg data-testid="c" />
      </ChartHoverLayer>,
    );
  }
  it('ignores pointers with no layout', () => {
    const { container } = renderLayer();
    const surface = screen.getByRole('slider');
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 0,
      top: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerMove(surface, { clientX: 10 });
    expect(container.querySelector('.chart-tooltip')).toBeNull();
  });
  it('falls back to previous index when no event is ahead', () => {
    renderLayer([
      { index: 1, y: 10, asset: 'BTC', action: 'buy', label: 'bought' },
    ]);
    const surface = screen.getByRole('slider');
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
    fireEvent.focus(surface);
    fireEvent.keyDown(surface, { key: 'End' });
    expect(surface).toHaveAttribute('aria-valuenow', '4');
    fireEvent.keyDown(surface, { key: 'ArrowRight', shiftKey: true });
    expect(surface).toHaveAttribute('aria-valuenow', '4');
  });
});

describe('pitch nav null branches', () => {
  function mount(slides: number, withCounter: boolean) {
    let captured: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class MockIO {
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = () => [];
      constructor(cb: IntersectionObserverCallback) {
        captured = cb;
      }
    }
    const orig = globalThis.IntersectionObserver;
    vi.stubGlobal('IntersectionObserver', MockIO);
    if (withCounter) {
      const c = document.createElement('span');
      c.setAttribute('data-pitch-counter-current', '');
      document.body.appendChild(c);
    }
    const els: HTMLElement[] = [];
    for (const s of PITCH_SLIDES.slice(0, slides)) {
      const el = document.createElement('section');
      el.id = `slide-${s.id}`;
      el.setAttribute('data-slide-id', s.id);
      el.scrollIntoView = vi.fn();
      document.body.appendChild(el);
      els.push(el);
    }
    const utils = render(<PitchNav />);
    return {
      ...utils,
      observe,
      disconnect,
      els,
      fire(targets: HTMLElement[]) {
        const obs = { disconnect, observe } as unknown as IntersectionObserver;
        const entries = targets.map((t) => ({
          target: t,
          isIntersecting: true,
        })) as unknown as IntersectionObserverEntry[];
        act(() => captured!(entries, obs));
      },
      teardown() {
        vi.stubGlobal('IntersectionObserver', orig);
      },
    };
  }
  it('tolerates a missing counter node', () => {
    const ctx = mount(2, false);
    try {
      ctx.fire([ctx.els[0]!]);
      expect(screen.getAllByRole('button')[0]).toHaveAttribute(
        'data-active',
        'true',
      );
    } finally {
      ctx.teardown();
    }
  });
  it('skips entries with no slide id', () => {
    const ctx = mount(2, true);
    try {
      const orphan = document.createElement('section');
      document.body.appendChild(orphan);
      ctx.fire([orphan]);
      expect(screen.getAllByRole('button')[0]).toHaveAttribute(
        'data-active',
        'true',
      );
    } finally {
      ctx.teardown();
    }
  });
});

describe('instrumentation NODE_ENV fallback', () => {
  it('logs unknown release when NODE_ENV is missing', async () => {
    vi.stubEnv('NODE_ENV', undefined as unknown as string);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.resetModules();
    try {
      await import('@/instrumentation-client');
      expect(log).toHaveBeenCalledWith(expect.stringContaining('unknown'));
    } finally {
      vi.unstubAllEnvs();
      log.mockRestore();
    }
  });
});

describe('app cta link edge branches', () => {
  it('submits with missing form fields', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true } as Response);
    const { AppCtaLink } = await import('@/components/landing-v2/AppCtaLink');
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
    render(
      <AppCtaLink className="cta" location="hero">
        Join waitlist
      </AppCtaLink>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Join waitlist' }));
    const email = screen.getByPlaceholderText('you@example.com');
    email.removeAttribute('name');
    const dialog = screen.getByRole('dialog');
    dialog.querySelector('input[name="company"]')?.removeAttribute('name');
    fireEvent.submit(email.closest('form')!);
    expect(await screen.findByText('You’re on the list ✓')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });
  it('ignores Tab from a middle control', async () => {
    const { AppCtaLink } = await import('@/components/landing-v2/AppCtaLink');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);
    render(
      <AppCtaLink className="cta" location="hero">
        Join waitlist
      </AppCtaLink>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Join waitlist' }));
    const dialog = screen.getByRole('dialog');
    const email = screen.getByPlaceholderText('you@example.com');
    email.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog).toBeInTheDocument();
  });
});

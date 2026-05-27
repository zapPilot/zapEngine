import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGES } from '@/config/messages';
import { RegimeStripV2 } from '../RegimeStripV2';

function okResponse(json: object): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(json), {
      status: 200,
    }),
  );
}

function mockLiveTelemetryFetch(
  overrides: Partial<
    Record<'regime' | 'sentiment' | 'dashboard', 'reject'>
  > = {},
) {
  vi.mocked(fetch).mockImplementation((input) => {
    const url = String(input);

    if (url.includes('/api/v2/market/regime/history')) {
      if (overrides.regime === 'reject') {
        return Promise.reject(new Error('regime unavailable'));
      }

      return okResponse({
        current: {
          to_regime: 'ef',
        },
      });
    }

    if (url.includes('/api/v2/market/sentiment')) {
      if (overrides.sentiment === 'reject') {
        return Promise.reject(new Error('sentiment unavailable'));
      }

      return okResponse({
        value: 21,
        status: 'Extreme Fear',
      });
    }

    if (url.includes('/api/v2/market/dashboard')) {
      if (overrides.dashboard === 'reject') {
        return Promise.reject(new Error('dashboard unavailable'));
      }

      return okResponse({
        snapshots: [
          {
            snapshot_date: '2026-05-12',
            values: {
              btc: {
                value: 125_000,
                indicators: {
                  dma_200: {
                    value: 100_000,
                  },
                },
              },
            },
          },
        ],
      });
    }

    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

function expectSkeleton(container: HTMLElement) {
  expect(
    container.querySelectorAll('.regime-strip-item.is-skeleton'),
  ).toHaveLength(3);
  expect(container.querySelector('.regime-strip')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  expect(
    screen.getByText(MESSAGES.regimeStrip.pendingStatus),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(MESSAGES.regimeStrip.liveStatus),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Greed')).not.toBeInTheDocument();
  expect(screen.queryByText('72')).not.toBeInTheDocument();
  expect(screen.queryByText('+14.2%')).not.toBeInTheDocument();
}

describe('RegimeStripV2', () => {
  const originalAnalyticsApiUrl =
    process.env['NEXT_PUBLIC_ANALYTICS_API_URL'] ?? undefined;

  beforeEach(() => {
    process.env['NEXT_PUBLIC_ANALYTICS_API_URL'] = 'http://analytics.test';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
  });

  afterEach(() => {
    if (originalAnalyticsApiUrl === undefined) {
      delete process.env['NEXT_PUBLIC_ANALYTICS_API_URL'];
    } else {
      process.env['NEXT_PUBLIC_ANALYTICS_API_URL'] = originalAnalyticsApiUrl;
    }
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders section element', () => {
      const { container } = render(<RegimeStripV2 />);
      expect(
        container.querySelector('.regime-strip-section'),
      ).toBeInTheDocument();
    });

    it('has aria-label for regime data', () => {
      const { container } = render(<RegimeStripV2 />);
      expect(container.querySelector('.regime-strip-section')).toHaveAttribute(
        'aria-label',
        MESSAGES.regimeStrip.ariaLabel,
      );
    });

    it('renders telemetry header copy', () => {
      render(<RegimeStripV2 />);
      expect(screen.getByText(MESSAGES.regimeStrip.header)).toBeInTheDocument();
    });
  });

  describe('live telemetry', () => {
    it('renders a skeleton while live telemetry is pending', () => {
      vi.mocked(fetch).mockImplementation(
        () => new Promise<Response>(() => {}),
      );

      const { container } = render(<RegimeStripV2 />);

      expectSkeleton(container);
      expect(
        container.querySelector('.live-status [aria-hidden]'),
      ).not.toBeInTheDocument();
    });

    it('stays skeleton when the market API fails', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('network unavailable'));

      const { container } = render(<RegimeStripV2 />);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(3);
      });

      expectSkeleton(container);
    });

    it('renders remaining items when one telemetry endpoint fails persistently', async () => {
      mockLiveTelemetryFetch({ dashboard: 'reject' });

      const { container } = render(<RegimeStripV2 />);

      await waitFor(() => {
        expect(screen.getByText('Extreme Fear')).toBeInTheDocument();
      });

      expect(screen.getByText('21')).toBeInTheDocument();
      expect(screen.queryByText('+25.0%')).not.toBeInTheDocument();
      expect(
        container.querySelectorAll('.regime-strip-item.is-skeleton'),
      ).toHaveLength(0);
      expect(container.querySelector('.regime-strip')).not.toHaveAttribute(
        'aria-busy',
      );
      expect(
        screen.getByText(MESSAGES.regimeStrip.liveStatus),
      ).toBeInTheDocument();
    });

    it('renders fetched telemetry values when all endpoints succeed', async () => {
      mockLiveTelemetryFetch();

      const { container } = render(<RegimeStripV2 />);

      await waitFor(() => {
        expect(screen.getByText('Extreme Fear')).toBeInTheDocument();
      });

      expect(screen.getByText('21')).toBeInTheDocument();
      expect(screen.getByText('+25.0%')).toBeInTheDocument();
      expect(
        container.querySelectorAll('.regime-strip-item.is-skeleton'),
      ).toHaveLength(0);
      expect(container.querySelector('.regime-strip')).not.toHaveAttribute(
        'aria-busy',
      );
      expect(
        screen.getByText(MESSAGES.regimeStrip.liveStatus),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(MESSAGES.regimeStrip.pendingStatus),
      ).not.toBeInTheDocument();
      expect(
        container.querySelector('.live-status [aria-hidden]'),
      ).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has regime strip container with polite live announcements', () => {
      const { container } = render(<RegimeStripV2 />);
      expect(container.querySelector('.regime-strip')).toHaveAttribute(
        'aria-live',
        'polite',
      );
    });

    it('has three skeleton items before live data arrives', () => {
      vi.mocked(fetch).mockImplementation(
        () => new Promise<Response>(() => {}),
      );

      const { container } = render(<RegimeStripV2 />);

      expect(
        container.querySelectorAll('.regime-strip-item.is-skeleton'),
      ).toHaveLength(3);
    });
  });
});

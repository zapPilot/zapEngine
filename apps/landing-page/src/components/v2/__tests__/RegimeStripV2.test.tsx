import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGES } from '@/config/messages';
import { RegimeStripV2 } from '../RegimeStripV2';

describe('RegimeStripV2', () => {
  const originalAnalyticsApiUrl =
    process.env['NEXT_PUBLIC_ANALYTICS_API_URL'] ?? undefined;

  beforeEach(() => {
    process.env['NEXT_PUBLIC_ANALYTICS_API_URL'] = 'http://analytics.test';
    vi.stubGlobal('fetch', vi.fn());
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
        'Regime data',
      );
    });

    it('renders live status', () => {
      render(<RegimeStripV2 />);
      expect(screen.getByText(/live · mainnet/)).toBeInTheDocument();
    });

    it('renders telemetry header', () => {
      render(<RegimeStripV2 />);
      expect(
        screen.getByText(/Telemetry feeding the next bundle/),
      ).toBeInTheDocument();
    });
  });

  describe('telemetry items', () => {
    it('renders the three live-backed regime items', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('network unavailable'));

      const { container } = render(<RegimeStripV2 />);

      expect(screen.getByText('Regime')).toBeInTheDocument();
      expect(screen.getByText('FGI')).toBeInTheDocument();
      expect(screen.getByText('200MA Δ')).toBeInTheDocument();

      await waitFor(() => {
        expect(container.querySelectorAll('.regime-strip-item')).toHaveLength(
          3,
        );
      });
      expect(screen.queryByText('Next rebal')).not.toBeInTheDocument();
    });

    it('renders regime value', () => {
      render(<RegimeStripV2 />);
      expect(screen.getByText('Greed')).toBeInTheDocument();
    });

    it('renders FGI value', () => {
      render(<RegimeStripV2 />);
      expect(screen.getByText('72')).toBeInTheDocument();
    });

    it('renders 200MA delta value', () => {
      render(<RegimeStripV2 />);
      const dmaItem = MESSAGES.regimeTelemetry.items.find(
        (item) => item.label === '200MA Δ',
      );

      expect(dmaItem).toBeDefined();
      expect(screen.getByText(dmaItem!.value)).toBeInTheDocument();
    });
  });

  describe('live telemetry', () => {
    it('renders static fallback values when the market API fails', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('network unavailable'));

      render(<RegimeStripV2 />);

      await waitFor(() => {
        expect(screen.getByText('Greed')).toBeInTheDocument();
      });

      MESSAGES.regimeTelemetry.items.forEach((item) => {
        expect(screen.getByText(item.value)).toBeInTheDocument();
      });
    });

    it('renders fetched telemetry values when the market API succeeds', async () => {
      vi.mocked(fetch).mockImplementation((input) => {
        const url = String(input);

        if (url.includes('/api/v2/market/regime/history')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                current: {
                  to_regime: 'ef',
                },
              }),
              { status: 200 },
            ),
          );
        }

        if (url.includes('/api/v2/market/sentiment')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                value: 21,
                status: 'Extreme Fear',
              }),
              { status: 200 },
            ),
          );
        }

        if (url.includes('/api/v2/market/dashboard')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
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
              }),
              { status: 200 },
            ),
          );
        }

        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      render(<RegimeStripV2 />);

      await waitFor(() => {
        expect(screen.getByText('Extreme Fear')).toBeInTheDocument();
      });

      expect(screen.getByText('21')).toBeInTheDocument();
      expect(screen.getByText('+25.0%')).toBeInTheDocument();
      expect(screen.queryByText('02:14:00')).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has regime strip container', () => {
      const { container } = render(<RegimeStripV2 />);
      expect(container.querySelector('.regime-strip')).toBeInTheDocument();
    });

    it('has regime strip items', () => {
      const { container } = render(<RegimeStripV2 />);
      expect(container.querySelectorAll('.regime-strip-item').length).toBe(3);
    });
  });
});

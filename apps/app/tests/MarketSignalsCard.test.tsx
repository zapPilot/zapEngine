// @vitest-environment jsdom
import { clickUi, renderInvestUi } from './support/investUiHarness';
import { describe, expect, it, vi } from 'vitest';

import { MarketSignalsCard } from '@/components/strategy/MarketSignalsCard';
import { zhHant, type TranslationKey } from '@/i18n/translations';
import type { MarketSignals } from '@/integration/marketSignalsModel';

vi.mock('@/components/charts/IndicatorLineChart', () => ({
  IndicatorLineChart: ({
    series,
    domain,
  }: {
    series: number[];
    domain?: readonly [number, number];
  }) => (
    <figure
      data-points={series.length}
      data-domain={domain ? domain.join('-') : 'auto'}
    />
  ),
}));
vi.mock('@/components/ui/Skeleton', () => ({
  SkeletonBlock: () => <span data-skeleton />,
}));
vi.mock('@/providers/ContentLanguageProvider', () => ({
  useContentLanguage: () => ({
    t: (key: TranslationKey, params?: Record<string, string | number>) =>
      zhHant[key].replace(/\{(\w+)\}/g, (_, name: string) =>
        String(params?.[name]),
      ),
  }),
}));

const DATES = ['2025-09-20', '2026-06-20', '2026-09-23', '2026-09-24'];

const SIGNALS: MarketSignals = {
  asOf: '2026-09-24',
  trends: [
    {
      id: 'btc',
      latestDate: '2026-09-24',
      latest: 84695,
      dma: 70716.95,
      distance: 0.1977,
      isAbove: true,
      sideSince: '2026-04-29',
      dates: DATES,
      values: [60000, 65000, 83000, 84695],
      dmaValues: [70000, 70500, 70700, 70716.95],
    },
    {
      id: 'eth_btc',
      latestDate: '2026-09-24',
      latest: 0.0317772,
      dma: 0.0337,
      distance: -0.057,
      isAbove: false,
      sideSince: null,
      dates: DATES,
      values: [0.04, 0.035, 0.032, 0.0317772],
      dmaValues: [0.036, 0.035, 0.034, 0.0337],
    },
  ],
  sentiments: [
    {
      id: 'fgi',
      latestDate: '2026-09-24',
      latest: 74,
      regime: 'greed',
      previousRegime: 'neutral',
      regimeSince: '2026-09-10',
      dates: DATES,
      values: [30, 50, 70, 74],
    },
    {
      id: 'macro_fear_greed',
      latestDate: '2026-09-24',
      latest: 35.94,
      regime: 'fear',
      previousRegime: null,
      regimeSince: null,
      dates: DATES,
      values: [40, 38, 36, 35.94],
    },
  ],
};

describe('MarketSignalsCard', () => {
  it('summarises every signal with its value, distance, and regime run', async () => {
    const container = await renderInvestUi(
      <MarketSignalsCard
        signals={SIGNALS}
        loading={false}
        highlightedSignalId={null}
      />,
    );
    const text = container.textContent ?? '';

    expect(text).toContain('資料日期 2026-09-24');
    expect(text).toContain('$84,695');
    expect(text).toContain('+19.8%');
    expect(text).toContain('200DMA $70,717 · 2026-04-29 起站上');
    expect(text).toContain('0.03178');
    expect(text).toContain('−5.7%');
    expect(text).toContain('200DMA 0.03370 · 一整年都在均線下');
    expect(text).toContain('74貪婪');
    expect(text).toContain('2026-09-10 起 · 前一段：中性');
    expect(text).toContain('36恐懼');
    expect(text).toContain('一整年');
    expect(text).toContain('Crypto F&G 用於 BTC、ETH，Macro F&G 用於 SPY。');
    expect(container.querySelector('figure')).toBeNull();
  });

  it("opens today's triggering series and charts the chosen range", async () => {
    const container = await renderInvestUi(
      <MarketSignalsCard
        signals={SIGNALS}
        loading={false}
        highlightedSignalId="btc"
      />,
    );

    expect(container.textContent).toContain('今日觸發');
    const chart = () => container.querySelector('figure');
    expect(chart()?.getAttribute('data-points')).toBe('3');

    await clickUi(container, '3M');
    expect(chart()?.getAttribute('data-points')).toBe('2');

    await clickUi(container, 'BTC 走勢圖');
    expect(chart()).toBeNull();
  });

  it('charts sentiment on a fixed 0–100 scale', async () => {
    const container = await renderInvestUi(
      <MarketSignalsCard
        signals={SIGNALS}
        loading={false}
        highlightedSignalId={null}
      />,
    );

    await clickUi(container, 'Crypto F&G 走勢圖');
    expect(container.querySelector('figure')?.getAttribute('data-domain')).toBe(
      '0-100',
    );
  });

  it('distinguishes loading from unavailable data', async () => {
    const loading = await renderInvestUi(
      <MarketSignalsCard signals={null} loading highlightedSignalId={null} />,
    );
    expect(loading.querySelector('[data-skeleton]')).not.toBeNull();

    const unavailable = await renderInvestUi(
      <MarketSignalsCard
        signals={null}
        loading={false}
        highlightedSignalId={null}
      />,
    );
    expect(unavailable.textContent).toContain('目前無法取得市場訊號。');
  });
});

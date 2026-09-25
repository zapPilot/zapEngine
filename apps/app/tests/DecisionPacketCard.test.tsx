// @vitest-environment jsdom
import { renderInvestUi } from './support/investUiHarness';
import { describe, expect, it, vi } from 'vitest';

import { DecisionPacketCard } from '@/components/strategy/DecisionPacketCard';
import { zhHant, type TranslationKey } from '@/i18n/translations';
import type { StrategyDecisionPacket } from '@/integration/useStrategyDecisionPacket';

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

function packet(
  overrides: Partial<StrategyDecisionPacket> = {},
): StrategyDecisionPacket {
  return {
    status: 'action_required',
    asOf: '2026-09-24',
    reason: 'dma_overextension',
    regime: 'Greed',
    fearGreed: 74,
    actions: [],
    statusPanel: {
      actionCardTitle: '1 Action',
      actionCardSubtitle: '',
      bodyTitle: '',
      bodyDescription: 'Trim BTC',
      ctaLabel: '',
      ctaDisabled: true,
    },
    trigger: {
      kind: 'dma',
      ruleName: 'dma_overextension_dca_sell',
      ruleLabel: 'Dma overextension dca sell',
      metrics: [{ label: 'Distance', value: '+19.8%' }],
      chartSeriesId: 'btc',
    },
    ruleTrace: [
      {
        ruleName: 'cross_down_exit',
        status: 'cooldown',
        suppressedBy: null,
        cooldownRemainingDays: 4,
      },
      {
        ruleName: 'eth_btc_ratio_rotation',
        status: 'not_matched',
        suppressedBy: null,
        cooldownRemainingDays: null,
      },
      {
        ruleName: 'dma_overextension_dca_sell',
        status: 'fired',
        suppressedBy: null,
        cooldownRemainingDays: null,
      },
      {
        ruleName: 'fgi_downshift_dca_sell',
        status: 'shadowed',
        suppressedBy: 'dma_overextension_dca_sell',
        cooldownRemainingDays: null,
      },
      {
        ruleName: 'technical_rsi_probe',
        status: 'inactive',
        suppressedBy: null,
        cooldownRemainingDays: null,
      },
    ],
    guards: { cooldown: 'unavailable', quota: 'unavailable' },
    allocation: { before: [], after: [] },
    ...overrides,
  };
}

describe('DecisionPacketCard', () => {
  it('names the triggering rule and explains every rule it evaluated', async () => {
    const text =
      (
        await renderInvestUi(
          <DecisionPacketCard packet={packet()} loading={false} />,
        )
      ).textContent ?? '';

    expect(text).toContain('觸發條件'.toUpperCase());
    expect(text).toContain('偏離 200DMA 過高分批賣出');
    expect(text).toContain('為什麼');
    expect(text).toContain('跌破 200DMA 出場冷卻中 · 剩 4 天');
    expect(text).toContain('ETH/BTC 比值輪動未觸發');
    expect(text).toContain('偏離 200DMA 過高分批賣出觸發');
    expect(text).toContain('情緒轉弱分批賣出讓給「偏離 200DMA 過高分批賣出」');
    expect(text).toContain('Technical rsi probe未啟用');
  });

  it('hides the explanation when the backend sends no rule trace', async () => {
    const text =
      (
        await renderInvestUi(
          <DecisionPacketCard
            packet={packet({
              ruleTrace: [],
              trigger: {
                kind: 'none',
                ruleName: null,
                ruleLabel: 'Signal details unavailable',
                metrics: [],
                chartSeriesId: null,
              },
            })}
            loading={false}
          />,
        )
      ).textContent ?? '';

    expect(text).toContain('Signal details unavailable');
    expect(text).not.toContain('為什麼');
  });

  it('shows a cooldown without a day count when the backend omits it', async () => {
    const text =
      (
        await renderInvestUi(
          <DecisionPacketCard
            packet={packet({
              ruleTrace: [
                {
                  ruleName: 'cross_down_exit',
                  status: 'cooldown',
                  suppressedBy: null,
                  cooldownRemainingDays: null,
                },
              ],
            })}
            loading={false}
          />,
        )
      ).textContent ?? '';

    expect(text).toContain('跌破 200DMA 出場冷卻中');
    expect(text).not.toContain('剩');
  });
});

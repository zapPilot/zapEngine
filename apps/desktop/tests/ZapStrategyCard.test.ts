import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ZapStrategyCard } from '../src/components/strategy/ZapStrategyCard';
import { DEMO } from '../src/data/demo';

type StrategySlice = (typeof DEMO)['strategy'];

function renderCard(strategy: StrategySlice): string {
  return renderToStaticMarkup(
    createElement(ZapStrategyCard, { strategy, onStart: vi.fn() }),
  );
}

describe('ZapStrategyCard', () => {
  it('renders strategy headline, allocation, preferred metrics, and CTA', () => {
    const markup = renderCard(DEMO.strategy);

    expect(markup).toContain('Zap Strategy');
    expect(markup).toContain('Disciplined autopilot');
    expect(markup).toContain('Buy in fear. Defend in greed.');
    expect(markup).toContain('6–12%');
    expect(markup).toContain('Default backtest ROI');
    expect(markup).toContain('Max drawdown');
    expect(markup).toContain('Managed automatically');
    expect(markup).toContain('Non-custodial');
    expect(markup).toContain('Base deposits in v1');
    expect(markup).toContain('Start with Zap Strategy');
  });

  it('falls back to the first two backtest metrics when ROI is unavailable', () => {
    const strategy: StrategySlice = {
      ...DEMO.strategy,
      estApyLabel: '—',
      backtest: {
        ...DEMO.strategy.backtest,
        metrics: [
          { label: 'Sharpe', value: '1.23', tone: 'accent' },
          { label: 'Trades', value: '42', tone: 'neutral' },
          { label: 'Final value', value: '$12,345.68', tone: 'positive' },
        ],
      },
    };

    const markup = renderCard(strategy);

    expect(markup).toContain('Backtest ROI unavailable');
    expect(markup).toContain('Sharpe');
    expect(markup).toContain('Trades');
    expect(markup).not.toContain('Final value');
  });
});

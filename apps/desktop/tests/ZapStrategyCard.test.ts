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
  it('renders a compact strategy summary and CTA', () => {
    const markup = renderCard(DEMO.strategy);

    expect(markup).toContain('Zap Strategy');
    expect(markup).toContain('Disciplined autopilot');
    expect(markup).toContain('Buy in fear. Defend in greed.');
    expect(markup).toContain('6–12%');
    expect(markup).toContain('Default backtest ROI');
    expect(markup).toContain('Start with Zap Strategy');
    expect(markup).not.toContain('Max drawdown');
    expect(markup).not.toContain('Managed automatically');
    expect(markup).not.toContain('Non-custodial');
    expect(markup).not.toContain('Base deposits in v1');
  });

  it('omits placeholder quote text instead of rendering a decorative dash', () => {
    const strategy: StrategySlice = {
      ...DEMO.strategy,
      quote: '—',
    };

    const markup = renderCard(strategy);

    expect(markup).toContain('Zap Strategy');
    expect(markup).not.toContain('&ldquo;—&rdquo;');
  });
});

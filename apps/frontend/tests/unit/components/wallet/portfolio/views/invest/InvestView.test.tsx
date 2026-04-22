import { type ReactElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { InvestView } from '@/components/wallet/portfolio/views/invest/InvestView';
import type { InvestSubTab, MarketSection } from '@/types';

import { fireEvent, render, screen } from '../../../../../../test-utils';

// Mock child views to avoid deep dependency chains
vi.mock(
  '@/components/wallet/portfolio/views/invest/trading/TradingView',
  () => ({
    TradingView: ({ userId }: { userId: string | undefined }) => (
      <div data-testid="trading-view">{userId ?? 'no-user'}</div>
    ),
  }),
);

vi.mock('@/components/wallet/portfolio/views/BacktestingView', () => ({
  BacktestingView: () => <div data-testid="backtesting-view" />,
}));

vi.mock(
  '@/components/wallet/portfolio/views/invest/market/MarketDashboardView',
  () => ({
    MarketDashboardView: ({
      activeSection,
      onSectionChange,
    }: {
      activeSection?: MarketSection;
      onSectionChange?: (section: MarketSection) => void;
    }) => (
      <div data-testid="market-dashboard-view">
        <span>{activeSection}</span>
        <button onClick={() => onSectionChange?.('relative-strength')}>
          Select Relative Strength
        </button>
      </div>
    ),
  }),
);

vi.mock('@/components/wallet/portfolio/views/invest/configManager', () => ({
  ConfigManagerView: () => <div data-testid="config-manager-view" />,
}));

interface ControlledInvestViewProps {
  userId?: string;
  initialSubTab?: InvestSubTab;
  initialMarketSection?: MarketSection;
}

function ControlledInvestView({
  userId,
  initialSubTab = 'trading',
  initialMarketSection = 'overview',
}: ControlledInvestViewProps): ReactElement {
  const [activeSubTab, setActiveSubTab] = useState<InvestSubTab>(initialSubTab);
  const [activeMarketSection, setActiveMarketSection] =
    useState<MarketSection>(initialMarketSection);

  return (
    <InvestView
      userId={userId}
      activeSubTab={activeSubTab}
      activeMarketSection={activeMarketSection}
      onSubTabChange={setActiveSubTab}
      onMarketSectionChange={setActiveMarketSection}
    />
  );
}

describe('InvestView', () => {
  it('renders trading tab by default', () => {
    render(<ControlledInvestView userId="0xabc" />);

    expect(screen.getByTestId('trading-view')).toBeDefined();
    expect(screen.getByText('0xabc')).toBeDefined();
  });

  it('renders all four tab buttons', () => {
    render(<ControlledInvestView userId="0xabc" />);

    expect(screen.getByText('market data')).toBeDefined();
    expect(screen.getByText('trading')).toBeDefined();
    expect(screen.getByText('backtesting')).toBeDefined();
    expect(screen.getByText('config manager')).toBeDefined();
  });

  it('switches to market tab on click', () => {
    render(<ControlledInvestView userId="0xabc" />);

    fireEvent.click(screen.getByText('market data'));

    expect(screen.getByTestId('market-dashboard-view')).toBeDefined();
    expect(screen.queryByTestId('trading-view')).toBeNull();
  });

  it('switches to backtesting tab on click', () => {
    render(<ControlledInvestView userId="0xabc" />);

    fireEvent.click(screen.getByText('backtesting'));

    expect(screen.getByTestId('backtesting-view')).toBeDefined();
    expect(screen.queryByTestId('trading-view')).toBeNull();
  });

  it('switches back to trading tab', () => {
    render(<ControlledInvestView userId="0xabc" />);

    fireEvent.click(screen.getByText('backtesting'));
    fireEvent.click(screen.getByText('trading'));

    expect(screen.getByTestId('trading-view')).toBeDefined();
    expect(screen.queryByTestId('backtesting-view')).toBeNull();
  });

  it('passes undefined userId to TradingView', () => {
    render(<ControlledInvestView userId={undefined} />);

    expect(screen.getByText('no-user')).toBeDefined();
  });

  it('switches to config manager tab on click', () => {
    render(<ControlledInvestView userId="0xabc" />);

    fireEvent.click(screen.getByText('config manager'));

    expect(screen.getByTestId('config-manager-view')).toBeDefined();
    expect(screen.queryByTestId('trading-view')).toBeNull();
  });

  it('passes market section updates through to the market view', () => {
    render(
      <ControlledInvestView
        userId="0xabc"
        initialSubTab="market"
        initialMarketSection="overview"
      />,
    );

    expect(screen.getByText('overview')).toBeDefined();
    fireEvent.click(screen.getByText('Select Relative Strength'));

    expect(screen.getByText('relative-strength')).toBeDefined();
  });

  it('applies active style to the selected tab', () => {
    render(<ControlledInvestView userId="0xabc" />);

    const tradingBtn = screen.getByText('trading').closest('button');
    expect(tradingBtn?.className).toContain('text-white');
  });

  it('applies inactive style to non-selected tabs', () => {
    render(<ControlledInvestView userId="0xabc" />);

    // 'backtesting' is not the active tab when trading is active
    const backtestingBtn = screen.getByText('backtesting').closest('button');
    expect(backtestingBtn?.className).toContain('text-gray-500');
    expect(backtestingBtn?.className).not.toContain('text-white');
  });

  it('renders with default props when optional handlers not provided', () => {
    // InvestView should render without throwing even when no handlers are passed
    render(<InvestView userId="0xabc" />);

    expect(screen.getByTestId('trading-view')).toBeDefined();
  });

  it('shows active tab underline indicator for current tab only', () => {
    render(<ControlledInvestView userId="0xabc" />);

    // The active tab indicator (bottom bar) should be inside the trading button
    const tradingBtn = screen.getByText('trading').closest('button');
    // The indicator div exists inside the button
    const indicator = tradingBtn?.querySelector('.absolute.bottom-0');
    expect(indicator).not.toBeNull();

    // Backtesting (inactive) should NOT have the indicator
    const backtestingBtn = screen.getByText('backtesting').closest('button');
    const inactiveIndicator =
      backtestingBtn?.querySelector('.absolute.bottom-0');
    expect(inactiveIndicator).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  VariationImpact,
  VariationRoute,
  VariationStrategy,
} from '@/components/wallet/portfolio/views/invest/trading/components/ReviewModalTabs';

import { render, screen } from '../../../../../../../../test-utils';

vi.mock('lucide-react', () => {
  const Icon = () => <svg />;
  return {
    AlertCircle: Icon,
    AlertTriangle: Icon,
    ArrowRight: Icon,
    CheckCircle: Icon,
    Clock: Icon,
    Cpu: Icon,
    Globe: Icon,
    Layers: Icon,
    LineChart: Icon,
    Quote: Icon,
    ShieldCheck: Icon,
    TrendingDown: Icon,
    TrendingUp: Icon,
    XCircle: Icon,
    Zap: Icon,
  };
});

vi.mock('@/lib/ui/classNames', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

describe('VariationStrategy', () => {
  it('renders regime label', () => {
    render(<VariationStrategy />);
    expect(screen.getByText('Extreme Fear')).toBeInTheDocument();
  });

  it('renders FGI value', () => {
    render(<VariationStrategy />);
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders philosophy quote', () => {
    render(<VariationStrategy />);
    expect(
      screen.getByText(/Be greedy when others are fearful/),
    ).toBeInTheDocument();
  });

  it('renders philosophy author', () => {
    render(<VariationStrategy />);
    expect(screen.getByText(/Warren Buffett/)).toBeInTheDocument();
  });

  it('renders pattern reason text', () => {
    render(<VariationStrategy />);
    expect(
      screen.getByText(/FGI dropped below 20 for 3\+ consecutive days/),
    ).toBeInTheDocument();
  });

  it('renders pacing step info', () => {
    render(<VariationStrategy />);
    expect(screen.getByText(/Step/)).toBeInTheDocument();
    expect(screen.getByText(/of 8/)).toBeInTheDocument();
  });

  it('renders convergence percentage', () => {
    render(<VariationStrategy />);
    expect(screen.getByText('15%')).toBeInTheDocument();
  });

  it('renders backtest period', () => {
    render(<VariationStrategy />);
    expect(screen.getByText(/365 days/)).toBeInTheDocument();
  });

  it('renders ROI backtest metric', () => {
    render(<VariationStrategy />);
    expect(screen.getByText('ROI')).toBeInTheDocument();
    expect(screen.getByText(/\+42\.3%/)).toBeInTheDocument();
  });

  it('renders Sharpe ratio backtest metric', () => {
    render(<VariationStrategy />);
    expect(screen.getByText('Sharpe Ratio')).toBeInTheDocument();
    expect(screen.getByText('1.85')).toBeInTheDocument();
  });

  it('renders max drawdown backtest metric', () => {
    render(<VariationStrategy />);
    expect(screen.getByText('Max Drawdown')).toBeInTheDocument();
    expect(screen.getByText('-12.4%')).toBeInTheDocument();
  });

  it('renders vs HODL backtest metric', () => {
    render(<VariationStrategy />);
    expect(screen.getByText('vs HODL')).toBeInTheDocument();
    expect(screen.getByText(/\+18\.2% alpha/)).toBeInTheDocument();
  });
});

describe('VariationImpact', () => {
  it('renders allocation breakdown heading', () => {
    render(<VariationImpact />);
    expect(screen.getByText('Allocation Breakdown')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<VariationImpact />);
    expect(screen.getByText('Bucket')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Target')).toBeInTheDocument();
    expect(screen.getByText('Change')).toBeInTheDocument();
  });

  it('renders Spot bucket row with correct values', () => {
    render(<VariationImpact />);
    expect(screen.getByText('Spot')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText('+25%')).toBeInTheDocument();
  });

  it('renders Stable bucket row with correct values', () => {
    render(<VariationImpact />);
    expect(screen.getByText('Stable')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('-25%')).toBeInTheDocument();
  });

  it('renders pure rebalance summary text', () => {
    render(<VariationImpact />);
    expect(screen.getByText('Pure rebalance')).toBeInTheDocument();
  });

  it('renders no new capital needed text', () => {
    render(<VariationImpact />);
    expect(
      screen.getByText(/No new capital needed · Internal position shifts only/),
    ).toBeInTheDocument();
  });
});

describe('VariationRoute', () => {
  it('renders source step with Ethereum Mainnet', () => {
    render(<VariationRoute />);
    expect(screen.getByText('Ethereum Mainnet')).toBeInTheDocument();
    expect(screen.getAllByText('10.5 ETH')).toHaveLength(2);
  });

  it('renders bridge step with Across Protocol', () => {
    render(<VariationRoute />);
    expect(screen.getByText('Across Protocol')).toBeInTheDocument();
    expect(screen.getByText('~2 mins')).toBeInTheDocument();
  });

  it('renders target step with Arbitrum One', () => {
    render(<VariationRoute />);
    expect(screen.getByText('Arbitrum One')).toBeInTheDocument();
  });

  it('renders action step with Uniswap V3', () => {
    render(<VariationRoute />);
    expect(screen.getByText('Uniswap V3')).toBeInTheDocument();
    expect(screen.getByText('Swap ETH -> WBTC')).toBeInTheDocument();
  });

  it('renders finish step with All-Weather Vault', () => {
    render(<VariationRoute />);
    expect(screen.getByText('All-Weather Vault')).toBeInTheDocument();
    expect(screen.getByText('Vault Allocation')).toBeInTheDocument();
  });

  it('renders all step types', () => {
    render(<VariationRoute />);
    const stepTypes = screen.getAllByText(
      /source|bridge|target|action|finish/i,
    );
    expect(stepTypes).toHaveLength(5);
  });
});

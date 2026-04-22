import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BacktestCommandBar } from '@/components/wallet/portfolio/views/backtesting/components/BacktestCommandBar';

vi.mock('@/hooks/ui/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

vi.mock(
  '@/components/wallet/portfolio/views/backtesting/components/TerminalDropdown',
  () => ({
    TerminalDropdown: (props: {
      value: string;
      onChange: (v: string) => void;
      disabled?: boolean;
    }) => (
      <button
        data-testid="terminal-dropdown"
        onClick={() => props.onChange('new_strategy')}
        disabled={props.disabled}
      >
        {props.value}
      </button>
    ),
  }),
);

describe('BacktestCommandBar', () => {
  const mockOnDaysChange = vi.fn();
  const mockOnStrategyChange = vi.fn();
  const mockOnRun = vi.fn();

  const defaultProps = {
    days: 500,
    onDaysChange: mockOnDaysChange,
    strategyOptions: [] as { value: string; label: string }[],
    selectedStrategyId: 'dma_gated_fgi',
    onStrategyChange: mockOnStrategyChange,
    pacingEngineId: 'fgi_exponential',
    isPending: false,
    onRun: mockOnRun,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all static labels', () => {
    render(<BacktestCommandBar {...defaultProps} />);

    expect(screen.getByText('$')).toBeDefined();
    expect(screen.getByText('backtest')).toBeDefined();
    expect(screen.getByText('--days')).toBeDefined();
    expect(screen.getByText('--strategy')).toBeDefined();
    expect(screen.getByText('--pacing')).toBeDefined();
  });

  it('renders the days input with correct value', () => {
    render(<BacktestCommandBar {...defaultProps} />);

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveValue(500);
  });

  it('fires onDaysChange when the days input changes', () => {
    render(<BacktestCommandBar {...defaultProps} />);

    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '365' },
    });

    expect(mockOnDaysChange).toHaveBeenCalledOnce();
  });

  it('renders the pacing engine ID', () => {
    render(<BacktestCommandBar {...defaultProps} />);

    expect(screen.getByText('fgi_exponential')).toBeDefined();
  });

  it('shows static strategy label when strategyOptions has 0 or 1 item', () => {
    render(<BacktestCommandBar {...defaultProps} strategyOptions={[]} />);

    expect(screen.queryByTestId('terminal-dropdown')).toBeNull();
    expect(screen.getByText('dma_gated_fgi')).toBeDefined();
  });

  it('shows static strategy label for a single option', () => {
    render(
      <BacktestCommandBar
        {...defaultProps}
        strategyOptions={[{ value: 'dma_gated_fgi', label: 'DMA Gated FGI' }]}
      />,
    );

    expect(screen.queryByTestId('terminal-dropdown')).toBeNull();
    expect(screen.getByText('dma_gated_fgi')).toBeDefined();
  });

  it('shows TerminalDropdown when strategyOptions has multiple items', () => {
    render(
      <BacktestCommandBar
        {...defaultProps}
        strategyOptions={[
          { value: 'dma_gated_fgi', label: 'DMA Gated FGI' },
          { value: 'momentum_alpha', label: 'Momentum Alpha' },
        ]}
      />,
    );

    expect(screen.getByTestId('terminal-dropdown')).toBeDefined();
  });

  it('shows [RUN] text when not pending', () => {
    render(<BacktestCommandBar {...defaultProps} isPending={false} />);

    expect(screen.getByRole('button', { name: /RUN/i })).toBeDefined();
  });

  it('shows [...] text when pending', () => {
    render(<BacktestCommandBar {...defaultProps} isPending={true} />);

    const button = screen.getByRole('button', { name: '[...]' });
    expect(button.textContent).toBe('[...]');
  });

  it('disables the run button when pending', () => {
    render(<BacktestCommandBar {...defaultProps} isPending={true} />);

    const button = screen.getByRole('button', { name: '[...]' });
    expect(button).toBeDisabled();
  });

  it('enables the run button when not pending', () => {
    render(<BacktestCommandBar {...defaultProps} isPending={false} />);

    const button = screen.getByRole('button', { name: /RUN/i });
    expect(button).not.toBeDisabled();
  });

  it('fires onRun when the run button is clicked', () => {
    render(<BacktestCommandBar {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /RUN/i }));

    expect(mockOnRun).toHaveBeenCalledOnce();
  });
});

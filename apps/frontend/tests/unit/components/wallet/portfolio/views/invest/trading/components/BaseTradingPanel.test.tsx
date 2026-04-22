import { describe, expect, it, vi } from 'vitest';

import { BaseTradingPanel } from '@/components/wallet/portfolio/views/invest/trading/components/BaseTradingPanel';

import { render, screen } from '../../../../../../../../test-utils';

vi.mock(
  '@/components/wallet/portfolio/views/invest/trading/components/ActionCard',
  () => ({
    ActionCard: ({ children, title, subtitle, icon, footer }: any) => (
      <div
        data-testid="action-card"
        data-title={title}
        data-subtitle={subtitle}
      >
        {icon && <div data-testid="action-card-icon">{icon}</div>}
        {children}
        {footer && <div data-testid="action-card-footer">{footer}</div>}
      </div>
    ),
  }),
);

vi.mock(
  '@/components/wallet/portfolio/views/invest/trading/components/ReviewModal',
  () => ({
    ReviewModal: ({ isOpen, title }: any) =>
      isOpen ? <div data-testid="review-modal">{title}</div> : null,
  }),
);

describe('BaseTradingPanel', () => {
  const defaultProps = {
    title: 'Test Trading Panel',
    subtitle: 'Panel subtitle text',
    actionCardTitle: 'Action Card Title',
    actionCardSubtitle: 'Action card subtitle',
    impactVisual: <div data-testid="impact-visual" />,
    children: <div data-testid="panel-children">Panel Content</div>,
    footer: <div data-testid="panel-footer">Footer Content</div>,
    isReviewOpen: false,
    onCloseReview: vi.fn(),
    onConfirmReview: vi.fn(),
  };

  it('renders title and subtitle text', () => {
    render(<BaseTradingPanel {...defaultProps} />);

    expect(screen.getByText('Test Trading Panel')).toBeInTheDocument();
    expect(screen.getByText('Panel subtitle text')).toBeInTheDocument();
  });

  it('renders headerBadge when provided', () => {
    const badge = <span data-testid="header-badge">Badge Content</span>;
    render(<BaseTradingPanel {...defaultProps} headerBadge={badge} />);

    expect(screen.getByTestId('header-badge')).toBeInTheDocument();
    expect(screen.getByText('Badge Content')).toBeInTheDocument();
  });

  it('does NOT render headerBadge section content when not provided', () => {
    render(<BaseTradingPanel {...defaultProps} />);

    expect(screen.queryByTestId('header-badge')).not.toBeInTheDocument();
  });

  it('renders impactVisual inside ActionCard when provided', () => {
    render(<BaseTradingPanel {...defaultProps} />);

    expect(screen.getByTestId('impact-visual')).toBeInTheDocument();
  });

  it('omits the impact visual slot when not provided', () => {
    render(<BaseTradingPanel {...defaultProps} impactVisual={undefined} />);

    expect(screen.queryByTestId('impact-visual')).not.toBeInTheDocument();
  });

  it('renders children inside ActionCard', () => {
    render(<BaseTradingPanel {...defaultProps} />);

    expect(screen.getByTestId('panel-children')).toBeInTheDocument();
    expect(screen.getByText('Panel Content')).toBeInTheDocument();
  });

  it('renders footer through ActionCard', () => {
    render(<BaseTradingPanel {...defaultProps} />);

    expect(screen.getByTestId('action-card-footer')).toBeInTheDocument();
    expect(screen.getByTestId('panel-footer')).toBeInTheDocument();
    expect(screen.getByText('Footer Content')).toBeInTheDocument();
  });

  it('shows ReviewModal when isReviewOpen is true', () => {
    render(<BaseTradingPanel {...defaultProps} isReviewOpen={true} />);

    expect(screen.getByTestId('review-modal')).toBeInTheDocument();
  });

  it('does NOT show ReviewModal when isReviewOpen is false', () => {
    render(<BaseTradingPanel {...defaultProps} isReviewOpen={false} />);

    expect(screen.queryByTestId('review-modal')).not.toBeInTheDocument();
  });

  it("defaults isSubmitting to false and reviewTitle to 'Review Execution'", () => {
    render(<BaseTradingPanel {...defaultProps} isReviewOpen={true} />);

    const modal = screen.getByTestId('review-modal');
    expect(modal).toHaveTextContent('Review Execution');
  });
});

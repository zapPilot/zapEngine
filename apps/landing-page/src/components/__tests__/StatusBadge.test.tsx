import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge, StatusNote } from '@/components/StatusBadge';
import { CAPABILITIES, STATUS_LABEL } from '@/config/runtime';

describe('StatusBadge', () => {
  it('renders the recorded status label for a capability', () => {
    const { container } = render(<StatusBadge capability="self-hosting" />);
    const badge = container.querySelector('[data-capability]');
    expect(badge).toHaveAttribute('data-capability', 'self-hosting');
    expect(badge).toHaveAttribute(
      'data-status',
      CAPABILITIES['self-hosting'].status,
    );
    expect(badge).toHaveTextContent(
      STATUS_LABEL[CAPABILITIES['self-hosting'].status],
    );
  });

  it('renders a qualifier outside the badge text', () => {
    const { container } = render(
      <StatusBadge capability="market-signals" qualifier="hosted" />,
    );
    expect(container.querySelector('[data-capability]')).toHaveTextContent(
      /^Live$/,
    );
    expect(screen.getByText('hosted')).toBeInTheDocument();
  });

  it('lets several capabilities that share a status share one badge', () => {
    const { container } = render(
      <StatusBadge capability={['strategy-lab', 'policy-engine']} />,
    );
    expect(container.querySelectorAll('[data-capability]')).toHaveLength(1);
    expect(container.querySelector('[data-capability]')).toHaveAttribute(
      'data-capability',
      'strategy-lab policy-engine',
    );
  });

  it('refuses to merge capabilities with different statuses', () => {
    expect(() =>
      render(
        <StatusBadge
          capability={
            ['reference-strategy', 'self-hosting'] as unknown as [
              'reference-strategy',
            ]
          }
        />,
      ),
    ).toThrow('do not share a status');
  });
});

describe('StatusNote', () => {
  it('leads the text with a badge when the note claims a capability', () => {
    const { container } = render(
      <StatusNote
        note={{ text: 'Deposits on mainnet', capability: 'deposit-plans' }}
      />,
    );
    expect(container.querySelector('[data-capability]')).toHaveTextContent(
      'Live',
    );
    expect(screen.getByText('Deposits on mainnet')).toBeInTheDocument();
  });

  it('renders plain text without a badge and honours a custom class', () => {
    const { container } = render(
      <StatusNote note={{ text: 'Hosted today' }} className="custom" />,
    );
    expect(container.querySelector('[data-capability]')).toBeNull();
    expect(container.firstChild).toHaveClass('custom');
  });
});

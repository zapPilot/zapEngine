import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SentimentChart } from '../SentimentChart';

const POINTS = [
  { date: '2026-08-19', value: 40, regime: 'Fear' },
  { date: '2026-08-20', value: 45, regime: 'Fear' },
];

describe('SentimentChart', () => {
  it('draws the fixed scale, four bands, and latest chip', () => {
    const { container } = render(
      <SentimentChart kicker="Sentiment" points={POINTS} title="Crypto FGI" />,
    );

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(container.querySelectorAll('.sentiment-band')).toHaveLength(4);
    expect(screen.getByText('45 · Fear')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /zero to one hundred/ }),
    ).toBeInTheDocument();
  });

  it('renders an empty state without points', () => {
    render(
      <SentimentChart kicker="Sentiment" points={[]} title="Crypto FGI" />,
    );
    expect(
      screen.getByText('No Crypto FGI signal data available.'),
    ).toBeInTheDocument();
  });
});

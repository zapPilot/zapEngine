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

  it.each([
    [10, 'Extreme Fear'],
    [25, 'Extreme Fear'],
    [30, 'Fear'],
    [45, 'Fear'],
    [50, 'Neutral'],
    [60, 'Greed'],
    [75, 'Greed'],
    [90, 'Extreme Greed'],
  ])('derives the %s regime label for %i', (value, regime) => {
    render(
      <SentimentChart
        kicker="Sentiment"
        points={[{ date: '2026-08-20', value, regime: null }]}
        title="Crypto FGI"
      />,
    );
    expect(screen.getByText(`${value} · ${regime}`)).toBeInTheDocument();
  });

  it('renders the caption when provided', () => {
    const { container } = render(
      <SentimentChart
        caption="Source: example."
        kicker="Sentiment"
        points={POINTS}
        title="Crypto FGI"
      />,
    );
    expect(container.querySelector('figcaption')).toHaveTextContent(
      'Source: example.',
    );
  });
});

it.each([
  [25, 'Extreme Fear'],
  [26, 'Fear'],
  [45, 'Fear'],
  [46, 'Neutral'],
  [54, 'Neutral'],
  [55, 'Greed'],
  [75, 'Greed'],
  [76, 'Extreme Greed'],
])('labels a missing provider regime at boundary %s', (value, regime) => {
  render(
    <SentimentChart
      kicker="Sentiment"
      title="FGI"
      points={[{ date: '2026-08-20', value, regime: null }]}
    />,
  );
  expect(screen.getByText(`${value} · ${regime}`)).toBeVisible();
});
it('keeps the provider label and renders its caption and custom class', () => {
  const { container } = render(
    <SentimentChart
      kicker="Sentiment"
      title="FGI"
      className="custom-signal"
      caption="Source: provider"
      points={[{ date: '2026-08-20', value: 50, regime: 'Provider neutral' }]}
    />,
  );
  expect(screen.getByText('50 · Provider neutral')).toBeVisible();
  expect(screen.getByText('Source: provider').tagName).toBe('FIGCAPTION');
  expect(container.querySelector('figure')).toHaveClass('custom-signal');
});

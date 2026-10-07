import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SignalsPage from '../page';

describe('SignalsPage', () => {
  it('renders all six charts from the committed artifact', () => {
    const { container } = render(<SignalsPage />);

    expect(screen.getByText('Market Signals')).toBeInTheDocument();
    expect(container.querySelectorAll('figure')).toHaveLength(6);
    expect(screen.getByText(/regenerated nightly/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Crypto Fear & Greed' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Macro Fear & Greed' }),
    ).toBeInTheDocument();
  });
});

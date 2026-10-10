import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import LandingPage from '../page';
describe('Motion landing', () => {
  it('renders the v3 engine, replay and join in order with a readable poster', () => {
    const { container } = render(<LandingPage />);
    expect(
      Array.from(container.querySelectorAll('main section')).map((s) => s.id),
    ).toEqual(['engine', 'replay', 'join']);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Your strategy. Your machine. Your wallet.',
    );
    expect(
      screen.getByText('A runtime for programmable portfolios'),
    ).toBeInTheDocument();
    expect(container.querySelector('.zp-world .zp-fc')).toBeInTheDocument();
    expect(container.querySelector('#replay')).toHaveAttribute(
      'data-theme',
      'night',
    );
    expect(
      screen.getByRole('heading', {
        name: 'Self-custody shouldn’t stop at the keys.',
      }),
    ).toBeInTheDocument();
    expect(container.querySelector('.zp-motion')).toHaveAttribute(
      'data-theme',
      'paper',
    );
  });
  it('resolves page anchors and offers App Store with no retired downloads', () => {
    const { container } = render(<LandingPage />);
    for (const link of container.querySelectorAll<HTMLAnchorElement>(
      'a[href^="#"]',
    ))
      expect(
        container.querySelector(link.getAttribute('href')!),
      ).not.toBeNull();
    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getByRole('link', { name: 'App Store' })).toHaveAttribute(
      'href',
      'https://apps.apple.com/app/id6749248542',
    );
    expect(
      container.querySelector(
        'a[href*=".dmg"],a[href*="play.google"],a[href*="v2.zap"]',
      ),
    ).toBeNull();
  });
  it('keeps email submission out of the URL and discloses backtest assumptions', () => {
    render(<LandingPage />);
    expect(screen.getByLabelText('Email').closest('form')).toHaveAttribute(
      'method',
      'post',
    );
    expect(screen.getByLabelText('Email')).toHaveAttribute('maxLength', '320');
    expect(
      screen.getByText(/assumes a yield on stablecoin balances only/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

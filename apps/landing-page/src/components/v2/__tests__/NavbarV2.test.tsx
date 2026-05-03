import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { NavbarV2 } from '../NavbarV2';

describe('NavbarV2', () => {
  describe('rendering', () => {
    it('renders navigation element with aria-label', () => {
      const { container } = render(<NavbarV2 />);
      const nav = container.querySelector('nav');
      expect(nav).toHaveAttribute('aria-label', 'Zap Pilot v2 navigation');
    });

    it('renders brand link', () => {
      const { container } = render(<NavbarV2 />);
      const brand = container.querySelector('.brand');
      expect(brand).toHaveAttribute('href', '/v2/');
      expect(brand).toHaveAttribute('aria-label', 'Zap Pilot v2 home');
    });

    it('renders brand name', () => {
      render(<NavbarV2 />);
      expect(screen.getByText(/Zap Pilot/)).toBeInTheDocument();
    });
  });

  describe('navigation links', () => {
    it('renders all NAV_ITEMS links', () => {
      render(<NavbarV2 />);

      expect(screen.getByRole('link', { name: 'Strategy' })).toHaveAttribute(
        'href',
        '#strategy',
      );
      expect(screen.getByRole('link', { name: 'Performance' })).toHaveAttribute(
        'href',
        '#proof',
      );
      expect(screen.getByRole('link', { name: 'Protocols' })).toHaveAttribute(
        'href',
        '#protocols',
      );
      expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
        'href',
        '/docs/',
      );
    });
  });

  describe('action links', () => {
    it('renders v1 toggle link', () => {
      render(<NavbarV2 />);
      const v1Link = screen.getByRole('link', { name: '← v1' });
      expect(v1Link).toHaveAttribute('target', '_blank');
      expect(v1Link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders Launch App CTA', () => {
      render(<NavbarV2 />);
      const ctaLink = screen.getByRole('link', { name: 'Launch App' });
      expect(ctaLink).toHaveAttribute('target', '_blank');
      expect(ctaLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('accessibility', () => {
    it('has proper nav landmark', () => {
      const { container } = render(<NavbarV2 />);
      expect(container.querySelector('nav')).toBeInTheDocument();
    });

    it('has nav-links with proper aria-label', () => {
      const { container } = render(<NavbarV2 />);
      const navLinks = container.querySelector('.nav-links');
      expect(navLinks).toHaveAttribute('aria-label', 'Page sections');
    });
  });
});

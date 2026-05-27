import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { LINKS } from '@/config/links';
import { Navbar } from '../Navbar';

describe('Navbar', () => {
  describe('rendering', () => {
    it('renders navigation element with aria-label', () => {
      const { container } = render(<Navbar />);
      const nav = container.querySelector('nav');
      expect(nav).toHaveAttribute('aria-label', 'Zap Pilot navigation');
    });

    it('renders brand link', () => {
      const { container } = render(<Navbar />);
      const brand = container.querySelector('.brand');
      expect(brand).toHaveAttribute('href', '/');
      expect(brand).toHaveAttribute('aria-label', 'Zap Pilot home');
    });

    it('renders brand name', () => {
      render(<Navbar />);
      expect(screen.getByText(/Zap Pilot/)).toBeInTheDocument();
    });
  });

  describe('navigation links', () => {
    it('renders all NAV_ITEMS links', () => {
      render(<Navbar />);

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
      expect(screen.getByRole('link', { name: 'Pitch' })).toHaveAttribute(
        'href',
        '/pitch/',
      );
    });
  });

  describe('action links', () => {
    it('renders Launch App CTA', () => {
      render(<Navbar />);
      const ctaLink = screen.getByRole('link', { name: 'Launch App' });
      expect(ctaLink).toHaveAttribute('href', LINKS.app);
      expect(ctaLink).toHaveAttribute('target', '_blank');
      expect(ctaLink).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('accessibility', () => {
    it('has proper nav landmark', () => {
      const { container } = render(<Navbar />);
      expect(container.querySelector('nav')).toBeInTheDocument();
    });

    it('has nav-links with proper aria-label', () => {
      const { container } = render(<Navbar />);
      const navLinks = container.querySelector('.nav-links');
      expect(navLinks).toHaveAttribute('aria-label', 'Page sections');
    });
  });
});

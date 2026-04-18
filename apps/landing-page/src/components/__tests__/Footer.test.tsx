import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Footer } from '../Footer';
import { LINKS, NAVIGATION } from '@/config/links';

describe('Footer', () => {
  describe('branding section', () => {
    it('should render the logo image', () => {
      render(<Footer />);

      const logo = screen.getByAltText('Zap Pilot Logo');
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute('src', '/zap-pilot-icon.svg');
    });

    it('should render the brand name', () => {
      render(<Footer />);

      expect(screen.getByText('Zap Pilot')).toBeInTheDocument();
    });

    it('should render the brand description', () => {
      render(<Footer />);

      expect(
        screen.getByText(/Sentiment-driven rebalancing for BTC\/ETH investors/)
      ).toBeInTheDocument();
    });
  });

  describe('social links', () => {
    it('should render Discord link', () => {
      render(<Footer />);

      const discordLinks = screen
        .getAllByRole('link')
        .filter(link => link.getAttribute('href') === LINKS.social.discord);
      expect(discordLinks.length).toBeGreaterThan(0);
    });

    it('should render Twitter/X link', () => {
      render(<Footer />);

      const twitterLinks = screen
        .getAllByRole('link')
        .filter(link => link.getAttribute('href') === LINKS.social.twitter);
      expect(twitterLinks.length).toBeGreaterThan(0);
    });

    it('should render GitHub link', () => {
      render(<Footer />);

      const githubLinks = screen
        .getAllByRole('link')
        .filter(link => link.getAttribute('href') === LINKS.social.github);
      expect(githubLinks.length).toBeGreaterThan(0);
    });

    it('should render contact email link', () => {
      render(<Footer />);

      const emailLinks = screen
        .getAllByRole('link')
        .filter(link => link.getAttribute('href') === LINKS.support.contactUs);
      expect(emailLinks.length).toBeGreaterThan(0);
    });

    it('should open social links in new tab', () => {
      render(<Footer />);

      const socialLinks = screen
        .getAllByRole('link')
        .filter(link => link.getAttribute('target') === '_blank');
      expect(socialLinks.length).toBeGreaterThan(0);
    });
  });

  describe('product links', () => {
    it('should render Product section title', () => {
      render(<Footer />);

      expect(screen.getByText('Product')).toBeInTheDocument();
    });

    it('should render all product navigation links', () => {
      render(<Footer />);

      NAVIGATION.footer.product.forEach(link => {
        expect(screen.getByRole('link', { name: link.label })).toBeInTheDocument();
      });
    });
  });

  describe('resources links', () => {
    it('should render Resources section title', () => {
      render(<Footer />);

      expect(screen.getByText('Resources')).toBeInTheDocument();
    });

    it('should render all resource navigation links', () => {
      render(<Footer />);

      NAVIGATION.footer.resources.forEach(link => {
        expect(screen.getByRole('link', { name: link.label })).toBeInTheDocument();
      });
    });

    it('should have correct href for documentation link', () => {
      render(<Footer />);

      const docsLink = screen.getByRole('link', { name: 'Documentation' });
      expect(docsLink).toHaveAttribute('href', LINKS.documentation);
    });
  });

  describe('bottom section', () => {
    it('should render copyright with current year', () => {
      render(<Footer />);

      const currentYear = new Date().getFullYear();
      expect(
        screen.getByText(`© ${currentYear} Zap Pilot. All rights reserved.`)
      ).toBeInTheDocument();
    });

    it('should render "Built with" message', () => {
      render(<Footer />);

      expect(screen.getByText(/Built with/)).toBeInTheDocument();
      expect(screen.getByText(/for DeFi/)).toBeInTheDocument();
    });

    it('should render heart emoji', () => {
      render(<Footer />);

      expect(screen.getByText('❤️')).toBeInTheDocument();
    });
  });

  describe('layout and styling', () => {
    it('should render as footer element', () => {
      const { container } = render(<Footer />);

      expect(container.querySelector('footer')).toBeInTheDocument();
    });

    it('should have backdrop blur styling', () => {
      const { container } = render(<Footer />);

      const footer = container.querySelector('footer');
      expect(footer).toHaveClass('backdrop-blur-lg');
    });

    it('should have border top', () => {
      const { container } = render(<Footer />);

      const footer = container.querySelector('footer');
      expect(footer).toHaveClass('border-t');
    });
  });

  describe('accessibility', () => {
    it('should have accessible logo image', () => {
      render(<Footer />);

      const logo = screen.getByAltText('Zap Pilot Logo');
      expect(logo).toHaveAttribute('alt', 'Zap Pilot Logo');
    });

    it('should have proper heading structure', () => {
      render(<Footer />);

      const headings = screen.getAllByRole('heading', { level: 3 });
      expect(headings.length).toBeGreaterThanOrEqual(2); // Product, Resources
    });
  });
});

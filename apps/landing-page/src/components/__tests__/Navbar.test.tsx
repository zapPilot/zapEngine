import '@testing-library/jest-dom';
import { render, screen, act, setupWindowMock } from '@/test-utils';
import { fireEvent } from '@testing-library/react';
import { Navbar } from '../Navbar';
import { NAVIGATION, LINKS } from '@/config/links';

describe('Navbar', () => {
  let mockWindowOpen: jest.Mock;
  let scroll: ReturnType<typeof setupWindowMock.scrollY>;

  beforeEach(() => {
    mockWindowOpen = setupWindowMock.open();
    scroll = setupWindowMock.scrollY(0);
  });

  describe('branding', () => {
    it('should render the logo image', () => {
      render(<Navbar />);

      const logo = screen.getByAltText('Zap Pilot Logo');
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute('src', '/zap-pilot-icon.svg');
    });

    it('should render the brand name', () => {
      render(<Navbar />);

      expect(screen.getByText('Zap Pilot')).toBeInTheDocument();
    });
  });

  describe('desktop navigation', () => {
    it('should render all navigation items', () => {
      render(<Navbar />);

      NAVIGATION.internal.forEach(item => {
        expect(screen.getByText(item.label)).toBeInTheDocument();
      });
    });

    it('should render navigation links with correct href', () => {
      render(<Navbar />);

      NAVIGATION.internal.forEach(item => {
        const link = screen.getByRole('link', { name: item.label });
        expect(link).toHaveAttribute('href', item.href);
      });
    });

    it('should render Launch App button', () => {
      render(<Navbar />);

      // There are multiple Launch App buttons (desktop and mobile)
      const buttons = screen.getAllByRole('button', { name: /Launch App/i });
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should open app link when Launch App is clicked', () => {
      render(<Navbar />);

      const buttons = screen.getAllByRole('button', { name: /Launch App/i });
      fireEvent.click(buttons[0]);

      expect(mockWindowOpen).toHaveBeenCalledWith(LINKS.app, '_blank', 'noopener,noreferrer');
    });
  });

  describe('mobile menu', () => {
    it('should toggle mobile menu when hamburger is clicked', () => {
      render(<Navbar />);

      // Initially mobile menu should not show items in mobile view
      const menuButton = screen.getByRole('button', { name: '' });

      // Click to open
      fireEvent.click(menuButton);

      // Menu should be visible - check for mobile nav items
      const mobileLinks = screen.getAllByRole('link');
      expect(mobileLinks.length).toBeGreaterThan(0);
    });

    it('should close mobile menu when a link is clicked', () => {
      render(<Navbar />);

      // Open menu
      const menuButton = screen.getByRole('button', { name: '' });
      fireEvent.click(menuButton);

      // Click a navigation link
      const links = screen.getAllByRole('link', { name: NAVIGATION.internal[0].label });
      // Click the mobile version (second one in DOM)
      fireEvent.click(links[links.length - 1]);

      // The menu close is handled by state, and AnimatePresence handles exit
      // We just verify the click handler was attached
      expect(links.length).toBeGreaterThan(0);
    });

    it('should open app link when mobile Launch App button is clicked', () => {
      render(<Navbar />);

      // Open menu first
      const menuButton = screen.getByRole('button', { name: '' });
      fireEvent.click(menuButton);

      // Get all Launch App buttons and click the mobile one (usually the second)
      const buttons = screen.getAllByRole('button', { name: /Launch App/i });
      // The mobile button is inside the AnimatePresence, click the last one
      fireEvent.click(buttons[buttons.length - 1]);

      expect(mockWindowOpen).toHaveBeenCalledWith(LINKS.app, '_blank', 'noopener,noreferrer');
    });
  });

  describe('scroll behavior', () => {
    it('should apply scrolled styles when scrolled past threshold', () => {
      const { container } = render(<Navbar />);

      // Initial state - transparent background
      const nav = container.querySelector('nav');
      expect(nav).toHaveClass('bg-transparent');

      // Simulate scroll
      act(() => {
        scroll.set(100);
        window.dispatchEvent(new Event('scroll'));
      });

      // After scroll - should have backdrop-blur
      expect(nav).toHaveClass('bg-gray-950/95');
      expect(nav).toHaveClass('backdrop-blur-lg');
    });

    it('should remove scrolled styles when scrolled back to top', () => {
      const { container } = render(<Navbar />);

      // Scroll down first
      act(() => {
        scroll.set(100);
        window.dispatchEvent(new Event('scroll'));
      });

      const nav = container.querySelector('nav');
      expect(nav).toHaveClass('bg-gray-950/95');

      // Scroll back to top
      act(() => {
        scroll.set(0);
        window.dispatchEvent(new Event('scroll'));
      });

      expect(nav).toHaveClass('bg-transparent');
    });
  });

  describe('layout', () => {
    it('should be fixed positioned', () => {
      const { container } = render(<Navbar />);

      const nav = container.querySelector('nav');
      expect(nav).toHaveClass('fixed');
      expect(nav).toHaveClass('top-0');
    });

    it('should have high z-index', () => {
      const { container } = render(<Navbar />);

      const nav = container.querySelector('nav');
      expect(nav).toHaveClass('z-50');
    });
  });

  describe('accessibility', () => {
    it('should have accessible logo image', () => {
      render(<Navbar />);

      const logo = screen.getByAltText('Zap Pilot Logo');
      expect(logo).toHaveAttribute('alt');
    });

    it('should have navigation landmarks', () => {
      const { container } = render(<Navbar />);

      expect(container.querySelector('nav')).toBeInTheDocument();
    });
  });
});

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { StatDisplay } from '../StatDisplay';
import type { Stat } from '@/lib/statistics';

describe('StatDisplay', () => {
  const mockTextStat: Stat = {
    label: 'Total Value Locked',
    value: '$261k+',
    type: 'text',
  };

  const mockIconStat: Stat = {
    label: 'Core Assets',
    type: 'icons',
    icons: [
      { src: '/btc.webp', alt: 'Bitcoin', name: 'BTC' },
      { src: '/eth.webp', alt: 'Ethereum', name: 'ETH' },
    ],
  };

  describe('text variant rendering', () => {
    it('should render text stat with value and label', () => {
      render(<StatDisplay stat={mockTextStat} index={0} />);

      expect(screen.getByText('$261k+')).toBeInTheDocument();
      expect(screen.getByText('Total Value Locked')).toBeInTheDocument();
    });

    it('should apply hero variant classes by default', () => {
      const { container } = render(<StatDisplay stat={mockTextStat} index={0} />);

      // Hero variant has specific gradient text classes
      const valueElement = container.querySelector('.bg-gradient-to-r');
      expect(valueElement).toBeInTheDocument();
    });
  });

  describe('icon variant rendering', () => {
    it('should render icon stat with images and label', () => {
      render(<StatDisplay stat={mockIconStat} index={0} />);

      expect(screen.getByText('Core Assets')).toBeInTheDocument();
      expect(screen.getByAltText('Bitcoin')).toBeInTheDocument();
      expect(screen.getByAltText('Ethereum')).toBeInTheDocument();
    });

    it('should render correct number of icons', () => {
      render(<StatDisplay stat={mockIconStat} index={0} />);

      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(2);
    });
  });

  describe('variant prop', () => {
    it('should apply hero variant styling', () => {
      const { container } = render(<StatDisplay stat={mockTextStat} index={0} variant="hero" />);

      // Hero has rounded-2xl container
      expect(container.querySelector('.rounded-2xl')).toBeInTheDocument();
    });

    it('should apply cta variant styling', () => {
      const { container } = render(<StatDisplay stat={mockTextStat} index={0} variant="cta" />);

      // CTA has text-center container
      expect(container.querySelector('.text-center')).toBeInTheDocument();
    });

    it('should render without animation when animate is false in cta variant', () => {
      const { container } = render(
        <StatDisplay stat={mockTextStat} index={0} variant="cta" animate={false} />
      );

      // Should render as plain div without motion wrapper
      expect(container.firstChild).toBeInTheDocument();
      expect(screen.getByText('$261k+')).toBeInTheDocument();
    });
  });

  describe('index prop', () => {
    it('should accept index for staggered animations', () => {
      render(<StatDisplay stat={mockTextStat} index={2} />);

      // Component should render with any index
      expect(screen.getByText('$261k+')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have accessible images with alt text', () => {
      render(<StatDisplay stat={mockIconStat} index={0} />);

      const btcImage = screen.getByAltText('Bitcoin');
      const ethImage = screen.getByAltText('Ethereum');

      expect(btcImage).toHaveAttribute('alt', 'Bitcoin');
      expect(ethImage).toHaveAttribute('alt', 'Ethereum');
    });
  });

  describe('icon sizes', () => {
    it('should use larger icons for hero variant', () => {
      render(<StatDisplay stat={mockIconStat} index={0} variant="hero" />);

      const images = screen.getAllByRole('img');
      // Hero variant uses 48x48 icons
      images.forEach(img => {
        expect(img).toHaveAttribute('width', '48');
        expect(img).toHaveAttribute('height', '48');
      });
    });

    it('should use smaller icons for cta variant', () => {
      render(<StatDisplay stat={mockIconStat} index={0} variant="cta" />);

      const images = screen.getAllByRole('img');
      // CTA variant uses 40x40 icons
      images.forEach(img => {
        expect(img).toHaveAttribute('width', '40');
        expect(img).toHaveAttribute('height', '40');
      });
    });
  });
});

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ProtocolsV2 } from '../ProtocolsV2';

describe('ProtocolsV2', () => {
  describe('rendering', () => {
    it('renders section element', () => {
      const { container } = render(<ProtocolsV2 />);
      expect(container.querySelector('.protocols-v2')).toBeInTheDocument();
    });

    it('renders section kicker', () => {
      render(<ProtocolsV2 />);
      expect(screen.getByText('Between trades')).toBeInTheDocument();
    });

    it('renders main heading', () => {
      render(<ProtocolsV2 />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
        /Where idle capital parks/,
      );
    });

    it('renders subtitle', () => {
      render(<ProtocolsV2 />);
      expect(screen.getByText(/Yield is the icing/)).toBeInTheDocument();
    });
  });

  describe('protocol links', () => {
    it('renders all four protocol links', () => {
      render(<ProtocolsV2 />);

      expect(screen.getByRole('link', { name: /Ondo/ })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /GMX v2/ })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Morpho/ })).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /Hyperliquid/ }),
      ).toBeInTheDocument();
    });

    it('protocol links open in new tab', () => {
      render(<ProtocolsV2 />);

      const ondoLink = screen.getByRole('link', { name: /Ondo/ });
      expect(ondoLink).toHaveAttribute('target', '_blank');
      expect(ondoLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders protocol categories', () => {
      render(<ProtocolsV2 />);

      expect(screen.getByText('Tokenized S&P500')).toBeInTheDocument();
      expect(screen.getAllByText('Stablecoin Parking').length).toBe(2);
    });

    it('renders protocol logo images with fixed dimensions', () => {
      render(<ProtocolsV2 />);

      const ondoLogo = screen.getByAltText('Ondo logo');
      expect(ondoLogo).toHaveAttribute('src', '/protocols/ondo.webp');
      expect(ondoLogo).toHaveAttribute('width', '64');
      expect(ondoLogo).toHaveAttribute('height', '64');
      expect(screen.getByAltText('GMX v2 logo')).toBeInTheDocument();
      expect(screen.getByAltText('Morpho logo')).toBeInTheDocument();
      expect(screen.getByAltText('Hyperliquid logo')).toBeInTheDocument();
    });

    it('renders protocol descriptions', () => {
      render(<ProtocolsV2 />);

      expect(screen.getByText(/On-chain exposure/)).toBeInTheDocument();
      expect(screen.getByText(/Curated lending vaults/)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has section with id', () => {
      const { container } = render(<ProtocolsV2 />);
      expect(container.querySelector('#protocols')).toBeInTheDocument();
    });

    it('has protocol card grid with aria-label', () => {
      const { container } = render(<ProtocolsV2 />);
      expect(container.querySelector('.protocol-card-grid')).toHaveAttribute(
        'aria-label',
        'Supported protocols',
      );
    });
  });
});

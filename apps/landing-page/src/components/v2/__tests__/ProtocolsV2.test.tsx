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
  });

  describe('accessibility', () => {
    it('has section with id', () => {
      const { container } = render(<ProtocolsV2 />);
      expect(container.querySelector('#protocols')).toBeInTheDocument();
    });

    it('has protocol chip row with aria-label', () => {
      const { container } = render(<ProtocolsV2 />);
      expect(container.querySelector('.protocol-chip-row')).toHaveAttribute(
        'aria-label',
        'Supported protocols',
      );
    });
  });
});

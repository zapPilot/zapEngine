'use client';

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TokenIcon, TokenPair } from '../TokenIcon';

describe('TokenIcon', () => {
  describe('rendering', () => {
    it('should render token image with correct alt text', () => {
      render(<TokenIcon token="btc" />);

      const img = screen.getByAltText('BTC');
      expect(img).toBeInTheDocument();
    });

    it('should render with correct src path', () => {
      render(<TokenIcon token="eth" />);

      const img = screen.getByAltText('ETH');
      expect(img).toHaveAttribute('src', expect.stringContaining('eth.webp'));
    });

    it('should apply rounded-full class', () => {
      render(<TokenIcon token="usdc" />);

      const img = screen.getByAltText('USDC');
      expect(img).toHaveClass('rounded-full');
    });

    it('should apply custom className', () => {
      render(<TokenIcon token="btc" className="custom-class" />);

      const img = screen.getByAltText('BTC');
      expect(img).toHaveClass('custom-class');
    });
  });

  describe('size presets', () => {
    it('should use md size (20px) by default', () => {
      render(<TokenIcon token="btc" />);

      const img = screen.getByAltText('BTC');
      expect(img).toHaveAttribute('width', '20');
      expect(img).toHaveAttribute('height', '20');
    });

    it('should apply sm size (16px)', () => {
      render(<TokenIcon token="btc" size="sm" />);

      const img = screen.getByAltText('BTC');
      expect(img).toHaveAttribute('width', '16');
      expect(img).toHaveAttribute('height', '16');
    });

    it('should apply lg size (24px)', () => {
      render(<TokenIcon token="btc" size="lg" />);

      const img = screen.getByAltText('BTC');
      expect(img).toHaveAttribute('width', '24');
      expect(img).toHaveAttribute('height', '24');
    });

    it('should accept numeric size', () => {
      render(<TokenIcon token="btc" size={32} />);

      const img = screen.getByAltText('BTC');
      expect(img).toHaveAttribute('width', '32');
      expect(img).toHaveAttribute('height', '32');
    });
  });
});

describe('TokenPair', () => {
  describe('rendering', () => {
    it('should render both token icons', () => {
      render(<TokenPair tokens={['btc', 'eth']} />);

      expect(screen.getByAltText('BTC')).toBeInTheDocument();
      expect(screen.getByAltText('ETH')).toBeInTheDocument();
    });

    it('should render first token before second token in DOM', () => {
      const { container } = render(<TokenPair tokens={['btc', 'usdc']} />);

      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(2);
      expect(images[0]).toHaveAttribute('alt', 'BTC');
      expect(images[1]).toHaveAttribute('alt', 'USDC');
    });

    it('should apply custom className to container', () => {
      const { container } = render(<TokenPair tokens={['btc', 'eth']} className="custom-class" />);

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('overlap behavior', () => {
    it('should use standard overlap (-space-x-1) by default', () => {
      const { container } = render(<TokenPair tokens={['btc', 'eth']} />);

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('-space-x-1');
      expect(wrapper).not.toHaveClass('-space-x-2');
    });

    it('should use aggressive overlap (-space-x-2) when overlap prop is true', () => {
      const { container } = render(<TokenPair tokens={['btc', 'eth']} overlap />);

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('-space-x-2');
      expect(wrapper).not.toHaveClass('-space-x-1');
    });

    it('should use standard overlap when overlap prop is false', () => {
      const { container } = render(<TokenPair tokens={['btc', 'eth']} overlap={false} />);

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('-space-x-1');
    });
  });

  describe('size prop', () => {
    it('should apply size to both tokens', () => {
      render(<TokenPair tokens={['btc', 'eth']} size="lg" />);

      const btc = screen.getByAltText('BTC');
      const eth = screen.getByAltText('ETH');

      expect(btc).toHaveAttribute('width', '24');
      expect(eth).toHaveAttribute('width', '24');
    });

    it('should accept numeric size for both tokens', () => {
      render(<TokenPair tokens={['btc', 'usdc']} size={18} />);

      const btc = screen.getByAltText('BTC');
      const usdc = screen.getByAltText('USDC');

      expect(btc).toHaveAttribute('width', '18');
      expect(usdc).toHaveAttribute('width', '18');
    });
  });
});

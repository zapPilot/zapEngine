import type { TokenBrandSymbol } from '@zapengine/brand-assets';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TOKEN_ICON_SRC } from '@/data/assetIcons';
import { ChainMark, ProtocolIcon, TokenIcon, TokenIconPair } from '../icons';

describe('TokenIcon', () => {
  it('renders a committed image for a known symbol', () => {
    const { container } = render(<TokenIcon symbol="ETH" size={20} />);
    expect(container.querySelector('img')).toHaveAttribute('width', '20');
  });

  it('normalizes mixed-case symbols', () => {
    const { container } = render(<TokenIcon symbol="cbBTC" />);
    expect(container.querySelector('img')).toBeInTheDocument();
  });

  it('uses the initial for an unknown symbol', () => {
    const { container } = render(<TokenIcon symbol="doge" />);
    expect(container.querySelector('.token-icon-glyph')).toHaveTextContent('D');
  });

  it('uses the registered glyph when artwork is unavailable', () => {
    const sources = TOKEN_ICON_SRC as Partial<
      Record<TokenBrandSymbol, (typeof TOKEN_ICON_SRC)[TokenBrandSymbol]>
    >;
    const spySource = sources.SPY;
    delete sources.SPY;

    try {
      const { container } = render(<TokenIcon symbol="SPY" />);
      expect(container.querySelector('.token-icon-glyph')).toHaveTextContent(
        'S',
      );
    } finally {
      sources.SPY = spySource!;
    }
  });
});

describe('ChainMark', () => {
  it('renders a chain mark and labels it only when requested', () => {
    const { container, rerender } = render(<ChainMark chainKey="arbitrum" />);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');

    rerender(<ChainMark chainKey="arbitrum" labelled />);
    expect(container.querySelector('img')).toHaveAttribute('alt', 'Arbitrum');
  });
});

describe('ProtocolIcon', () => {
  it('renders a registered protocol mark', () => {
    const { container } = render(<ProtocolIcon protocol="morpho" />);
    expect(container.querySelector('img')).toBeInTheDocument();
  });

  it('falls back to a monogram for an unknown protocol', () => {
    const { container } = render(<ProtocolIcon protocol="Pendle" />);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('P');
  });

  it('normalizes the GMX v2 display label', () => {
    const { container } = render(<ProtocolIcon protocol="GMX v2" />);
    expect(container.querySelector('img')).toBeInTheDocument();
  });
});

describe('TokenIconPair', () => {
  it('renders both marks in input order', () => {
    const { container } = render(<TokenIconPair symbols={['ETH', 'BTC']} />);
    const sources = [...container.querySelectorAll('img')].map((image) =>
      image.getAttribute('src'),
    );
    expect(sources).toHaveLength(2);
    expect(sources[0]).toContain('eth');
    expect(sources[1]).toContain('btc');
  });
});

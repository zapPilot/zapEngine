import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TokenBrandSymbol } from '@zapengine/brand-assets';
import { TOKEN_ICON_SRC } from '@/data/assetIcons';
import { TokenIcon } from '../TokenIcon';

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
    const { container } = render(<TokenIcon symbol="aave" />);
    expect(container.querySelector('.token-icon-glyph')).toHaveTextContent('A');
  });

  it('uses the registered glyph when artwork is bypassed', () => {
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

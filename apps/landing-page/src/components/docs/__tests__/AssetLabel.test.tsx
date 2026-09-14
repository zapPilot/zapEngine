import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AssetLabel, AssetPairLabel } from '../AssetLabel';

describe('AssetLabel', () => {
  it('uses the symbol and default icon size when no label or size is supplied', () => {
    const { container } = render(<AssetLabel symbol="ETH" />);

    expect(screen.getByText('ETH')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('width', '16');
  });

  it('honours an explicit label and icon size', () => {
    const { container } = render(
      <AssetLabel symbol="BTC" label="Bitcoin" size={24} />,
    );

    expect(screen.getByText('Bitcoin')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('width', '24');
  });
});

describe('AssetPairLabel', () => {
  it('builds the default pair label and default-sized icons', () => {
    const { container } = render(<AssetPairLabel first="ETH" second="USDC" />);

    expect(screen.getByText('ETH / USDC')).toBeInTheDocument();
    expect([...container.querySelectorAll('img')]).toHaveLength(2);
    expect(
      [...container.querySelectorAll('img')].every(
        (image) => image.getAttribute('width') === '16',
      ),
    ).toBe(true);
  });

  it('honours an explicit pair label and icon size', () => {
    const { container } = render(
      <AssetPairLabel
        first="WBTC"
        second="USDT"
        label="Bitcoin / Tether"
        size={20}
      />,
    );

    expect(screen.getByText('Bitcoin / Tether')).toBeInTheDocument();
    expect(
      [...container.querySelectorAll('img')].every(
        (image) => image.getAttribute('width') === '20',
      ),
    ).toBe(true);
  });
});

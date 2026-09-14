import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { nextImageMock } from '../next-image';

const MockImage = nextImageMock.default;

describe('nextImageMock', () => {
  it('removes Next-only props and supplies an empty alt by default', () => {
    render(
      <MockImage
        data-testid="image"
        src="/mark.png"
        priority
        placeholder="blur"
        blurDataURL="data:image/png;base64,abc"
        loading="eager"
        unoptimized
      />,
    );

    const image = screen.getByTestId('image');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('src', '/mark.png');
    expect(image).not.toHaveAttribute('priority');
    expect(image).not.toHaveAttribute('placeholder');
    expect(image).not.toHaveAttribute('blurDataURL');
    expect(image).not.toHaveAttribute('loading');
    expect(image).not.toHaveAttribute('unoptimized');
  });

  it('passes an explicit alt and ordinary image props through', () => {
    render(
      <MockImage
        alt="Zap Pilot"
        className="brand-image"
        height={20}
        src="/logo.png"
        width={40}
      />,
    );

    expect(screen.getByRole('img', { name: 'Zap Pilot' })).toHaveClass(
      'brand-image',
    );
  });
});

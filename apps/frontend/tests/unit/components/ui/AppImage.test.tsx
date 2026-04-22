import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppImage } from '@/components/ui/AppImage';

describe('AppImage', () => {
  it('renders an img element with required src and alt', () => {
    render(<AppImage src="/logo.png" alt="Logo" />);
    const img = screen.getByAltText('Logo');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/logo.png');
  });

  it("applies default decoding='async'", () => {
    render(<AppImage src="/logo.png" alt="Logo" />);
    const img = screen.getByAltText('Logo');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it("applies default loading='lazy'", () => {
    render(<AppImage src="/logo.png" alt="Logo" />);
    const img = screen.getByAltText('Logo');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('allows overriding decoding', () => {
    render(<AppImage src="/logo.png" alt="Logo" decoding="sync" />);
    const img = screen.getByAltText('Logo');
    expect(img).toHaveAttribute('decoding', 'sync');
  });

  it('allows overriding loading to eager', () => {
    render(<AppImage src="/logo.png" alt="Logo" loading="eager" />);
    const img = screen.getByAltText('Logo');
    expect(img).toHaveAttribute('loading', 'eager');
  });

  it('passes through additional props like width and height', () => {
    render(<AppImage src="/logo.png" alt="Logo" width={32} height={32} />);
    const img = screen.getByAltText('Logo');
    expect(img).toHaveAttribute('width', '32');
    expect(img).toHaveAttribute('height', '32');
  });

  it('passes through className prop', () => {
    render(<AppImage src="/logo.png" alt="Logo" className="my-class" />);
    const img = screen.getByAltText('Logo');
    expect(img).toHaveClass('my-class');
  });
});

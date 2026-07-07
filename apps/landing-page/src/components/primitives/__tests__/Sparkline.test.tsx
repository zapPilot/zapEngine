import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { Sparkline } from '../Sparkline';

describe('Sparkline', () => {
  it('renders nothing for fewer than two points', () => {
    const { container } = render(<Sparkline data={[100]} gradientId="g1" />);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('renders line and area paths with the given gradient id', () => {
    const { container } = render(
      <Sparkline data={[100, 102, 101]} gradientId="g2" />,
    );

    expect(container.querySelector('.sparkline-line')).toBeInTheDocument();
    expect(container.querySelector('.sparkline-area')).toBeInTheDocument();
    expect(container.querySelector('linearGradient')).toHaveAttribute(
      'id',
      'g2',
    );
  });

  it('only adds draw classes when animated', () => {
    const { container: animated } = render(
      <Sparkline data={[100, 102]} gradientId="g3" animated />,
    );
    const { container: still } = render(
      <Sparkline data={[100, 102]} gradientId="g4" />,
    );

    expect(animated.querySelector('.sparkline-line.draw')).toBeInTheDocument();
    expect(still.querySelector('.sparkline-line.draw')).not.toBeInTheDocument();
  });

  it('handles a flat series without NaN coordinates', () => {
    const { container } = render(
      <Sparkline data={[100, 100, 100]} gradientId="g5" />,
    );

    expect(
      container.querySelector('.sparkline-line')?.getAttribute('d'),
    ).not.toContain('NaN');
  });
});

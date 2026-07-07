import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { AllocationBar } from '../AllocationBar';

const SEGMENTS = [
  { color: 'rgb(215, 221, 231)', value: 42 },
  { color: 'rgb(247, 147, 26)', value: 38 },
  { color: 'rgb(39, 117, 202)', value: 20 },
];

describe('AllocationBar', () => {
  it('renders one segment per entry with proportional widths', () => {
    const { container } = render(<AllocationBar segments={SEGMENTS} />);
    const segments = container.querySelectorAll('.allocation-bar-segment');

    expect(segments.length).toBe(3);
    expect(segments[0] as HTMLElement).toHaveStyle({ width: '42%' });
    expect(segments[2] as HTMLElement).toHaveStyle({ width: '20%' });
  });

  it('normalizes weights that do not sum to 100', () => {
    const { container } = render(
      <AllocationBar
        segments={[
          { color: 'red', value: 1 },
          { color: 'blue', value: 3 },
        ]}
      />,
    );
    const segments = container.querySelectorAll('.allocation-bar-segment');

    expect(segments[0] as HTMLElement).toHaveStyle({ width: '25%' });
    expect(segments[1] as HTMLElement).toHaveStyle({ width: '75%' });
  });

  it('does not divide by zero when all values are zero', () => {
    const { container } = render(
      <AllocationBar segments={[{ color: 'red', value: 0 }]} />,
    );

    expect(
      container.querySelector('.allocation-bar-segment') as HTMLElement,
    ).toHaveStyle({ width: '0%' });
  });

  it('exposes an accessible label', () => {
    render(
      <AllocationBar segments={SEGMENTS} ariaLabel="Example allocation" />,
    );

    expect(
      screen.getByRole('img', { name: 'Example allocation' }),
    ).toBeInTheDocument();
  });
});

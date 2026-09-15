// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MiniBars } from './MiniBars.js';

afterEach(cleanup);

describe('MiniBars coverage', () => {
  it('draws a stub when every reading is missing', () => {
    const { container } = render(
      <MiniBars
        ariaLabel="Spend per day"
        bars={[
          { id: 'd1', label: 'Mon', value: null },
          { id: 'd2', label: 'Tue', value: null },
        ]}
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Spend per day' }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[data-empty="true"]')).toHaveLength(2);
  });

  it('draws a flat stub for a zero reading rather than dividing by zero', () => {
    const { container } = render(
      <MiniBars
        ariaLabel="Spend per day"
        bars={[{ id: 'd1', label: 'Mon', value: 0 }]}
      />,
    );

    const bar = container.querySelector('span[title="Mon: 0"]');
    expect(bar).not.toBeNull();
    expect(bar).toHaveStyle({ height: '3px' });
  });

  it('scales positive readings against the largest one', () => {
    const { container } = render(
      <MiniBars
        ariaLabel="Spend per day"
        bars={[
          { id: 'd1', label: 'Mon', value: 2 },
          { id: 'd2', label: 'Tue', value: 4 },
        ]}
        tone="warning"
      />,
    );

    const bars = container.querySelectorAll('.cc-bars > span');
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveStyle({ height: '50%' });
    expect(bars[1]).toHaveStyle({ height: '100%' });
  });
});

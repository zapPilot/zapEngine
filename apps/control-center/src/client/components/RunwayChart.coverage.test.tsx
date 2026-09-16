// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderRunwayChart } from '../__fixtures__/render.js';
import { RunwayChart } from './RunwayChart.js';
import {
  costHistoryFixture,
  costProvidersFixture,
} from '../__fixtures__/dashboard.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RunwayChart coverage', () => {
  it('falls back to the last accrued figure when no projection is given', () => {
    render(
      <RunwayChart
        history={costHistoryFixture().currentMonthDaily}
        projected={null}
        providers={costProvidersFixture()}
      />,
    );

    expect(screen.getByLabelText(/^Projected month-end /)).toBeInTheDocument();
  });

  it('falls back to the last accrued figure when projection is undefined', () => {
    render(
      <RunwayChart
        history={costHistoryFixture().currentMonthDaily}
        projected={undefined}
        providers={costProvidersFixture()}
      />,
    );

    expect(screen.getByLabelText(/^Projected month-end /)).toBeInTheDocument();
  });

  it('ignores keys other than Escape while a band has focus', () => {
    renderRunwayChart();
    const target = screen.getByLabelText(/^Aug 27 /);
    fireEvent.focus(target);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(target, { key: 'Enter' });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.blur(target);
  });

  it('anchors to zero when layout boxes are unavailable', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      null as unknown as DOMRect,
    );
    renderRunwayChart();
    const target = screen.getByLabelText(/^Aug 27 /);
    fireEvent.mouseEnter(target);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveStyle({ left: '0px', top: '0px' });
  });

  it('clamps a non-finite anchor to zero', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: Number.NaN,
      top: Number.NaN,
      width: Number.NaN,
      height: Number.NaN,
      right: Number.NaN,
      bottom: Number.NaN,
      x: Number.NaN,
      y: Number.NaN,
      toJSON: () => ({}),
    } as DOMRect);
    renderRunwayChart();
    const target = screen.getByLabelText(/^Aug 27 /);
    fireEvent.mouseEnter(target);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveStyle({ left: '0px', top: '0px' });
  });
});

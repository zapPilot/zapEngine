// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MeasuredViews } from './MeasuredViews.js';
afterEach(cleanup);
it('keeps number separate from window and flags measurements more than six hours late', () => {
  const view = render(
    <MeasuredViews
      metric={{ views: 120, measurementWindow: '24h', ageHours: 30 }}
      missing="—"
    />,
  );
  expect(screen.getByText('120')).toHaveTextContent(/^120$/);
  expect(screen.getByText(/24h/)).toBeInTheDocument();
  expect(screen.queryByText(/量於/)).toBeNull();
  view.rerender(
    <MeasuredViews
      metric={{ views: 120, measurementWindow: '24h', ageHours: 31 }}
      missing="—"
      suffix=" views"
    />,
  );
  expect(screen.getByText('120 views')).toBeInTheDocument();
  expect(screen.getByText(/量於 31h/)).toBeInTheDocument();
  view.rerender(
    <MeasuredViews
      metric={{ views: null, measurementWindow: '24h', ageHours: null }}
      missing="未取得"
    />,
  );
  expect(screen.getByText('未取得')).toBeInTheDocument();
  view.rerender(
    <MeasuredViews
      metric={{ views: 0, measurementWindow: null, ageHours: 31 }}
      missing="—"
    />,
  );
  expect(screen.getByText('0')).toBeInTheDocument();
  view.rerender(<MeasuredViews metric={undefined} missing="尚無快照" />);
  expect(screen.getByText('尚無快照')).toBeInTheDocument();
});

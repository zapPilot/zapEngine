// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { DashboardView } from './AppShell.js';
import { DashboardSkeleton } from './DashboardSkeleton.js';

afterEach(cleanup);

const views: DashboardView[] = [
  'home',
  'pipeline',
  'growth',
  'product',
  'reliability',
  'economics',
];

describe('DashboardSkeleton', () => {
  it.each(views)('renders an animated loading surface for %s', (view) => {
    const { container } = render(<DashboardSkeleton view={view} />);

    expect(
      screen.getByRole('status', { name: 'Loading dashboard data' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(
      container.querySelectorAll('.cc-skeleton-card').length,
    ).toBeGreaterThan(0);
    expect(
      container.querySelectorAll('.cc-skeleton-block').length,
    ).toBeGreaterThan(0);
  });
});

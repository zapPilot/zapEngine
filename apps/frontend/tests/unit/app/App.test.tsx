import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { App } from '@/app/App';

vi.mock('@/app/layout', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="root-layout">{children}</div>
  ),
}));

vi.mock('@/app/page', () => ({
  LandingPage: () => <div data-testid="landing-page" />,
}));

vi.mock('@/app/bundle/page', () => ({
  BundlePage: () => <div data-testid="bundle-page" />,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App route tree', () => {
  it('renders the landing page inside the root layout at /', () => {
    renderAt('/');

    expect(screen.getByTestId('root-layout')).toBeInTheDocument();
    expect(screen.getByTestId('landing-page')).toBeInTheDocument();
  });

  it('renders the bundle page at /bundle', () => {
    renderAt('/bundle');

    expect(screen.getByTestId('bundle-page')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument();
  });

  it('redirects unknown routes to the landing page', () => {
    renderAt('/does-not-exist');

    expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    expect(screen.queryByTestId('bundle-page')).not.toBeInTheDocument();
  });
});

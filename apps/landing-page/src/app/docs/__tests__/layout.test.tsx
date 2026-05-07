import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import Layout from '../layout';

vi.mock('fumadocs-ui/layouts/docs', () => ({
  DocsLayout: ({
    children,
    nav,
  }: {
    children: ReactNode;
    nav?: { title?: ReactNode; url?: string };
  }) => (
    <div data-testid="docs-layout" data-nav-url={nav?.url}>
      <a href={nav?.url}>{nav?.title}</a>
      {children}
    </div>
  ),
}));

vi.mock('@/lib/source', () => ({
  source: { pageTree: { name: 'docs' } },
}));

describe('docs layout', () => {
  it('uses the shared brand mark as a home link', () => {
    render(
      <Layout>
        <p>Docs content</p>
      </Layout>,
    );

    expect(screen.getByTestId('docs-layout')).toHaveAttribute(
      'data-nav-url',
      '/',
    );
    expect(screen.getByRole('link', { name: /Zap Pilot/ })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByText('Docs content')).toBeInTheDocument();
  });
});

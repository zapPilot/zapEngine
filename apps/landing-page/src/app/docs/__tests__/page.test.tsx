import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPage, generateParams, notFound } = vi.hoisted(() => ({
  getPage: vi.fn(),
  generateParams: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('@/lib/source', () => ({ source: { getPage, generateParams } }));
vi.mock('fumadocs-ui/mdx', () => ({ default: { p: 'p' } }));
vi.mock('fumadocs-ui/page', () => ({
  DocsPage: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  DocsBody: ({ children }: { children: ReactNode }) => (
    <article>{children}</article>
  ),
  DocsTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
  DocsDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

import Page, {
  generateMetadata,
  generateStaticParams,
} from '../[[...slug]]/page';

const data = {
  title: 'Strategy rules',
  description: 'How the strategy works',
  toc: [],
  body: ({ components }: { components: unknown }) => (
    <div data-components={Boolean(components)}>MDX body</div>
  ),
};

beforeEach(() => {
  vi.clearAllMocks();
  getPage.mockReturnValue({ data });
  generateParams.mockReturnValue([{ slug: ['strategy'] }]);
});

describe('docs page', () => {
  it('renders a resolved MDX page', async () => {
    render(await Page({ params: Promise.resolve({ slug: ['strategy'] }) }));
    expect(getPage).toHaveBeenCalledWith(['strategy']);
    expect(
      screen.getByRole('heading', { name: data.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(data.description)).toBeInTheDocument();
    expect(screen.getByText('MDX body')).toHaveAttribute(
      'data-components',
      'true',
    );
  });

  it('resolves the index route and delegates missing pages to notFound', async () => {
    getPage.mockReturnValueOnce({ data });
    await Page({ params: Promise.resolve({}) });
    expect(getPage).toHaveBeenCalledWith(undefined);
    getPage.mockReturnValueOnce(undefined);
    await expect(
      Page({ params: Promise.resolve({ slug: ['missing'] }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('delegates static params and builds metadata', async () => {
    expect(generateStaticParams()).toEqual([{ slug: ['strategy'] }]);
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: ['strategy'] }) }),
    ).resolves.toEqual({
      title: data.title,
      description: data.description,
    });
  });
});

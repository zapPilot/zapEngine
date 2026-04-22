import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BundlePage } from '@/app/bundle/page';

import { render, screen, waitFor } from '../../../test-utils';

function defaultBundlePageEntry() {
  return <div data-testid="bundle-page-entry">Bundle Page Entry Component</div>;
}

const { mockBundlePageEntry } = vi.hoisted(() => ({
  mockBundlePageEntry: vi.fn(),
}));

vi.mock('@/app/bundle/BundlePageEntry', () => ({
  BundlePageEntry: mockBundlePageEntry,
}));

describe('BundlePage', () => {
  beforeEach(() => {
    mockBundlePageEntry.mockReset();
    mockBundlePageEntry.mockImplementation(defaultBundlePageEntry);
  });

  it('renders the bundle page entry', () => {
    render(<BundlePage />);

    expect(screen.getByTestId('bundle-page-entry')).toBeInTheDocument();
  });

  it('shows the suspense fallback while the entry component is loading', async () => {
    let resolveEntry: () => void = () => {
      /* Will be assigned by Promise */
    };
    const pendingEntry = new Promise<void>((resolve) => {
      resolveEntry = resolve;
    });

    mockBundlePageEntry.mockImplementation(() => {
      throw pendingEntry;
    });

    render(<BundlePage />);

    expect(
      await screen.findByTestId('bundle-suspense-fallback'),
    ).toBeInTheDocument();

    mockBundlePageEntry.mockImplementation(defaultBundlePageEntry);
    resolveEntry();

    await waitFor(() => {
      expect(screen.getByTestId('bundle-page-entry')).toBeInTheDocument();
    });
  });

  it('propagates errors thrown by the entry component', () => {
    const error = new Error('Import failed');
    mockBundlePageEntry.mockImplementation(() => {
      throw error;
    });

    expect(() => render(<BundlePage />)).toThrow(error);
  });

  it('exports bundle page as default component', () => {
    expect(BundlePage).toBeDefined();
    expect(typeof BundlePage).toBe('function');
  });
});

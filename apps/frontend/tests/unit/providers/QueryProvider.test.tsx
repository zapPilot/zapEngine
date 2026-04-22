import { useQueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen, waitFor } from '../../test-utils';

vi.mock('@/lib/state/queryClient', () => {
  const { QueryClient } = require('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});

vi.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () => <div data-testid="devtools" />,
}));

const originalNodeEnv = process.env.NODE_ENV;
const originalDevtoolsFlag = process.env['VITE_ENABLE_RQ_DEVTOOLS'];

const loadQueryProvider = async (
  nodeEnv = 'test',
  devtoolsFlag: string | undefined = undefined,
) => {
  vi.resetModules();
  process.env.NODE_ENV = nodeEnv;

  if (devtoolsFlag === undefined) {
    delete process.env['VITE_ENABLE_RQ_DEVTOOLS'];
  } else {
    process.env['VITE_ENABLE_RQ_DEVTOOLS'] = devtoolsFlag;
  }

  return import('@/providers/QueryProvider');
};

describe('QueryProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalDevtoolsFlag === undefined) {
      delete process.env['VITE_ENABLE_RQ_DEVTOOLS'];
      return;
    }

    process.env['VITE_ENABLE_RQ_DEVTOOLS'] = originalDevtoolsFlag;
  });

  it('renders children', async () => {
    const { QueryProvider } = await loadQueryProvider();

    render(
      <QueryProvider>
        <div data-testid="test-child">Test Content</div>
      </QueryProvider>,
    );

    expect(screen.getByTestId('test-child')).toHaveTextContent('Test Content');
  });

  it('provides the QueryClient context', async () => {
    const { QueryProvider } = await loadQueryProvider();

    const TestComponent = () => {
      const queryClient = useQueryClient();
      return (
        <div data-testid="has-client">
          {queryClient ? 'Has Client' : 'No Client'}
        </div>
      );
    };

    render(
      <QueryProvider>
        <TestComponent />
      </QueryProvider>,
    );

    expect(screen.getByTestId('has-client')).toHaveTextContent('Has Client');
  });

  it('does not render devtools outside development', async () => {
    const { QueryProvider } = await loadQueryProvider('test', '1');

    render(
      <QueryProvider>
        <div>Child</div>
      </QueryProvider>,
    );

    expect(screen.queryByTestId('devtools')).not.toBeInTheDocument();
  });

  it('does not render devtools when the opt-in flag is absent', async () => {
    const { QueryProvider } = await loadQueryProvider('development');

    render(
      <QueryProvider>
        <div>Child</div>
      </QueryProvider>,
    );

    expect(screen.queryByTestId('devtools')).not.toBeInTheDocument();
  });

  it('renders devtools only when development mode is explicitly enabled', async () => {
    const { QueryProvider } = await loadQueryProvider('development', '1');

    render(
      <QueryProvider>
        <div>Child</div>
      </QueryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('devtools')).toBeInTheDocument();
    });
  });
});

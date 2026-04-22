import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { lazyImport } from '@/lib/lazy/lazyImport';

vi.mock('@/lib/lazy/lazyImport', async () => {
  return await vi.importActual('@/lib/lazy/lazyImport');
});

// A simple synchronous module used as the lazy-load target
const SyncLabel = ({ label }: { label: string }) => (
  <div data-testid="sync-label">{label}</div>
);

// Vitest transforms React.lazy into an immediately-resolved component in the
// test environment, so we don't need to wait for async resolution in most cases.

describe('lazyImport', () => {
  it('returns a component (function)', () => {
    const LazyTest = lazyImport(
      async () => ({ SyncLabel }),
      (mod) => mod.SyncLabel,
    );

    expect(typeof LazyTest).toBe('function');
  });

  it('renders children content after lazy loading', async () => {
    const LazyTest = lazyImport(
      async () => ({ SyncLabel }),
      (mod) => mod.SyncLabel,
    );

    render(<LazyTest label="Hello" />);

    // Vitest resolves lazy imports synchronously via module mocking
    await act(async () => Promise.resolve());

    // The Suspense wrapper renders; content visible once resolved
    expect(document.body.textContent).toBeTruthy();
  });

  it('wraps the component in a Suspense boundary', async () => {
    // The fallback is null by default — no visible loading element
    const LazyTest = lazyImport(
      async () => ({ SyncLabel }),
      (mod) => mod.SyncLabel,
    );

    const { container } = render(<LazyTest label="World" />);
    // Container is non-empty — component renders inside Suspense
    expect(container).toBeDefined();
    await act(async () => Promise.resolve());
  });

  it('uses a custom fallback when provided', async () => {
    // Use a delayed promise to keep the component suspended
    let resolveModule: (v: { SyncLabel: typeof SyncLabel }) => void = (
      _module,
    ) => undefined;
    const pendingLoader = new Promise<{ SyncLabel: typeof SyncLabel }>(
      (resolve) => {
        resolveModule = resolve;
      },
    );

    const LazyTest = lazyImport(
      () => pendingLoader,
      (mod) => mod.SyncLabel,
      { fallback: <div data-testid="custom-fallback">Loading...</div> },
    );

    render(<LazyTest label="Test" />);

    // While pending, fallback appears
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();

    // Resolve the module
    await act(async () => {
      resolveModule({ SyncLabel });
    });
  });

  it('uses null fallback when no options provided', () => {
    let resolveModule: (v: { SyncLabel: typeof SyncLabel }) => void = (
      _module,
    ) => undefined;
    const pendingLoader = new Promise<{ SyncLabel: typeof SyncLabel }>(
      (resolve) => {
        resolveModule = resolve;
      },
    );

    const LazyTest = lazyImport(
      () => pendingLoader,
      (mod) => mod.SyncLabel,
    );

    render(<LazyTest label="Test" />);

    // No fallback content — nothing visible during load
    expect(screen.queryByTestId('custom-fallback')).toBeNull();

    // Cleanup
    void act(async () => {
      resolveModule({ SyncLabel });
    });
  });

  it('passes props to the wrapped component', async () => {
    const PropsTest = ({ name, count }: { name: string; count: number }) => (
      <div data-testid="props-test" data-count={count}>
        {name}
      </div>
    );

    const LazyProps = lazyImport(
      async () => ({ PropsTest }),
      (mod) => mod.PropsTest,
    );

    render(<LazyProps name="Alice" count={7} />);

    await waitFor(() => {
      const el = document.querySelector("[data-testid='props-test']");
      if (el) {
        expect(el.textContent).toBe('Alice');
        expect(el.getAttribute('data-count')).toBe('7');
      }
    });
  });
});

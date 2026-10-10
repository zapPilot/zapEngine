// @vitest-environment jsdom

import { act, type ReactNode, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { TabGlyph } from '@/components/shell/TabGlyph';
import { AllocationDial } from '@/components/charts/AllocationDial';
import { BrandLockup } from '@/components/ui/BrandLockup';
import { Rail } from '@/components/ui/Rail';
import { StatusGlyph } from '@/components/ui/StatusGlyph';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  View: ({
    children,
    accessibilityLabel,
  }: {
    children: ReactNode;
    accessibilityLabel?: string;
  }) => <div aria-label={accessibilityLabel}>{children}</div>,
}));

// Model the web SVG adapter forwarding props to the DOM, including unsupported
// native accessibility props. Filtering them here would hide the regression.
vi.mock('react-native-svg', () => ({
  default: (props: ComponentProps<'svg'>) => <svg {...props} />,
  Path: (props: ComponentProps<'path'>) => <path {...props} />,
  Line: (props: ComponentProps<'line'>) => <line {...props} />,
  Circle: (props: ComponentProps<'circle'>) => <circle {...props} />,
  Defs: (props: ComponentProps<'defs'>) => <defs {...props} />,
  ClipPath: (props: ComponentProps<'clipPath'>) => <clipPath {...props} />,
  Rect: (props: ComponentProps<'rect'>) => <rect {...props} />,
}));

afterEach(() => vi.restoreAllMocks());

it('renders decorative SVGs hidden on web without native attribute warnings', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const error = vi.spyOn(console, 'error');
  try {
    await act(async () =>
      root.render(
        <>
          <BrandLockup heading={1} />
          <Rail />
          <StatusGlyph />
          <TabGlyph name="today" />
          <AllocationDial
            allocation={{ btc: 0.2, eth: 0.2, spy: 0.2, stable: 0.2, alt: 0.2 }}
          />
        </>,
      ),
    );
    expect(container.querySelector('[aria-label="Zap Pilot"]')).not.toBeNull();
    const decorative = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(decorative).toHaveLength(5);
    expect(container.querySelector('[accessible]')).toBeNull();
    expect(error).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});

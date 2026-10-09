import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  CAPABILITIES,
  type CapabilityStatus,
} from '@zapengine/zap-pilot-story/facts';
import { OgCard } from '@/components/og/OgCard';
vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(
      public element: ReactNode,
      public options: unknown,
    ) {}
  },
}));
import OpenGraphImage, {
  alt,
  contentType,
  dynamic,
  revalidate,
  size,
} from '../opengraph-image';
const original = Object.values(CAPABILITIES).map((part) => part.status);
afterEach(() =>
  Object.values(CAPABILITIES).forEach((part, i) => {
    (part as { status: CapabilityStatus }).status = original[i]!;
  }),
);
it('publishes a static PNG home card with packaged fonts and the planned machine', () => {
  const result = OpenGraphImage() as unknown as {
    element: ReactNode;
    options: { fonts: { data: Buffer }[] };
  };
  const { container } = render(<>{result.element}</>);
  expect(container).toHaveTextContent(
    'Zap Pilot is building a self-hosted runtime for programmable portfolios.',
  );
  expect(
    container.querySelector('[data-capability="self-hosting"]'),
  ).toHaveTextContent('Planned');
  expect(result.options.fonts[0]!.data.byteLength).toBeGreaterThan(1000);
  expect({ alt, contentType, dynamic, revalidate, size }).toEqual({
    alt: 'Zap Pilot — Your strategy. Your machine. Your wallet.',
    contentType: 'image/png',
    dynamic: 'force-static',
    revalidate: false,
    size: { width: 1200, height: 630 },
  });
});
it('tracks the self-hosting status marker when capability statuses change', () => {
  for (const status of [
    'planned',
    'research',
    'in-development',
    'live',
  ] as const) {
    Object.values(CAPABILITIES).forEach((part) => {
      (part as { status: CapabilityStatus }).status = status;
    });
    const { container } = render(
      <OgCard label="Home" url="zap-pilot.org" footer="Open source" />,
    );
    expect(
      container.querySelector('[data-capability="self-hosting"]'),
    ).toHaveAttribute('data-status', status);
  }
});

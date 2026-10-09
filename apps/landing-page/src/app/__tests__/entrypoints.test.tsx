import { HERO } from '@zapengine/zap-pilot-story/copy';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { captureException, imageResponse } = vi.hoisted(() => ({
  captureException: vi.fn(),
  imageResponse: vi.fn(function (
    this: unknown,
    element: ReactNode,
    options: unknown,
  ) {
    return { element, options };
  }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException }));
vi.mock('next/error', () => ({
  default: ({ statusCode }: { statusCode: number }) => (
    <div>Next error {statusCode}</div>
  ),
}));
vi.mock('next/og', () => ({ ImageResponse: imageResponse }));
vi.mock('next/font/local', () => ({
  default: () => ({ variable: 'font-local', className: 'font-local' }),
}));
vi.mock('@next/third-parties/google', () => ({
  GoogleAnalytics: ({ gaId }: { gaId: string }) => (
    <div data-testid="ga">{gaId}</div>
  ),
}));
vi.mock('fumadocs-ui/provider/next', () => ({
  RootProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="provider">{children}</div>
  ),
}));
vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { MESSAGES } from '@/config/messages';
import DistributionLayout, {
  metadata as distributionMetadata,
} from '../distribution/layout';
import GlobalError from '../global-error';
import RootLayout, { metadata as rootMetadata } from '../layout';
import PitchLayout, { metadata as pitchMetadata } from '../pitch/layout';
import { PITCH_OG } from '@/config/pitch';
import PitchOpenGraphImage, {
  alt,
  contentType,
  dynamic,
  revalidate,
  size,
} from '../pitch/opengraph-image';

afterEach(() => {
  delete process.env['NEXT_PUBLIC_GA_ID'];
  vi.clearAllMocks();
});

describe('app entrypoints', () => {
  it('publishes root metadata and renders providers without analytics', () => {
    render(
      <RootLayout>
        <p>content</p>
      </RootLayout>,
    );
    expect(rootMetadata.title).toBe(MESSAGES.meta.title);
    expect(rootMetadata.openGraph?.title).toBe(MESSAGES.meta.title);
    expect(rootMetadata.twitter?.title).toBe(MESSAGES.meta.title);
    expect(rootMetadata.description).toBe(MESSAGES.meta.description);
    expect(screen.getByText('content')).toHaveTextContent('content');
    expect(screen.queryByTestId('ga')).toBeNull();
    // Font classes land on <html>/<body>, which React does not render inside
    // the test container div (only the provider subtree appears in innerHTML),
    // so there is no queryable body to assert classes on here.
  });

  it('renders analytics only when configured', () => {
    process.env['NEXT_PUBLIC_GA_ID'] = 'G-TEST';
    render(
      <RootLayout>
        <p>content</p>
      </RootLayout>,
    );
    expect(screen.getByTestId('ga')).toHaveTextContent('G-TEST');
  });

  it('captures root errors and renders Next error fallback', async () => {
    const error = new Error('boom');
    render(<GlobalError error={error} />);
    expect(screen.getByText('Next error 0')).toBeInTheDocument();
    await waitFor(() => expect(captureException).toHaveBeenCalledWith(error));
  });

  it('keeps pitch and distribution layouts transparent while publishing route metadata', () => {
    render(
      <>
        <PitchLayout>
          <p>pitch child</p>
        </PitchLayout>
        <DistributionLayout>
          <p>distribution child</p>
        </DistributionLayout>
      </>,
    );
    expect(screen.getByText('pitch child')).toBeInTheDocument();
    expect(screen.getByText('distribution child')).toBeInTheDocument();
    expect(pitchMetadata.robots).toEqual({ index: false, follow: true });
    expect(distributionMetadata.robots).toEqual({ index: false, follow: true });
  });

  it('builds the static pitch social card', () => {
    const result = PitchOpenGraphImage();
    expect(imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining(size),
    );
    expect(result).toMatchObject({ options: expect.objectContaining(size) });
    render(<>{(result as unknown as { element: ReactNode }).element}</>);
    expect(screen.getByText('strategy.')).toBeInTheDocument();
    expect(screen.getByText(PITCH_OG.footer)).toBeInTheDocument();
    for (const chip of HERO.chips) {
      expect(screen.getByText(chip.text)).toBeInTheDocument();
    }
    expect({ alt, contentType, dynamic, revalidate }).toEqual({
      alt: 'Zap Pilot — Investor Pitch',
      contentType: 'image/png',
      dynamic: 'force-static',
      revalidate: false,
    });
  });
});

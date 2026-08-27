'use client';

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

// Required manual wiring for Sentry on the Next.js App Router: an error
// thrown above the root layout (or by ErrorBoundary itself) never reaches
// src/components/ErrorBoundary.tsx, and Next's own root error handling
// swallows it instead of surfacing it here. This file replaces the whole
// <html> document, so it cannot assume any app styling/providers still work.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}

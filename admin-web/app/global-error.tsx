'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Top-level boundary — catches errors in the root layout itself. Renders its own
// <html>/<body> because it replaces the root layout when it fires.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem', textAlign: 'center' }}>
        <h2>Something went wrong</h2>
        <p>An unexpected error occurred. The team has been notified.</p>
        <button
          onClick={reset}
          style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}

import * as Sentry from '@sentry/nextjs';

// Browser-side Sentry. No-op unless NEXT_PUBLIC_SENTRY_DSN is set.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  // Never send tokens/PII from the client; the BFF keeps secrets server-side.
  sendDefaultPii: false,
});

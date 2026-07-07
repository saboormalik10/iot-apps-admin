import * as Sentry from '@sentry/nextjs';

// Server-side Sentry. No-op unless SENTRY_DSN is set.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

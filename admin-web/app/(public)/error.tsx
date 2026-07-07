'use client';

import { RouteErrorBoundary } from '@/components/route-error-boundary';

export default function PublicError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary {...props} group="public" />;
}

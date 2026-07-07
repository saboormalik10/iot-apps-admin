import type { ReactNode } from 'react';

/**
 * (public) route group — scaffolded now, empty until the Month-11 share view.
 * Only the layout + error boundary exist in Month 7 (no routes yet).
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}

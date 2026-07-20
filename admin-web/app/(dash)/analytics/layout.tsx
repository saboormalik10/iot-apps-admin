import type { ReactNode } from 'react';
import { AnalyticsScopeBar } from '@/components/scope/analytics-scope-bar';

/**
 * Analytics section layout (plan §4-A3). Renders the reduced, type-scoped
 * AnalyticsScopeBar above every analytics route — both tabs (MET `/analytics`,
 * NEP `/analytics/nep`) and their daily-summary sub-pages. The global ScopeBar
 * hides itself under `/analytics` (see HIDDEN_PREFIXES in scope-bar.tsx).
 */
export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <AnalyticsScopeBar />
      {children}
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { QueryProvider } from '@/lib/query/provider';
import { UnitsProvider } from '@/lib/units';
import { A11yPrefsProvider } from '@/lib/a11y-prefs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';

/**
 * Client-side provider stack. next-themes writes `data-theme` on <html> to match
 * the token system (explicit toggle over prefers-color-scheme).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryProvider>
        <UnitsProvider>
          <A11yPrefsProvider>
            <TooltipProvider delayDuration={200}>
              {children}
              <Toaster />
            </TooltipProvider>
          </A11yPrefsProvider>
        </UnitsProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}

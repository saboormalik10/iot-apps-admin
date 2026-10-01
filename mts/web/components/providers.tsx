'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { DemoClockProvider } from '@/lib/demo-clock';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <DemoClockProvider>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster />
        </TooltipProvider>
      </DemoClockProvider>
    </ThemeProvider>
  );
}

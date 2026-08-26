import { useState, type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query/client';
import messages from '@/messages/en.json';

function Providers({ children }: { children: ReactNode }) {
  // Created ONCE per mount. Calling `makeQueryClient()` in the render body made a
  // brand-new client on every re-render, so any interaction threw away the cache
  // and refetched — which silently overwrote whatever the user had just typed.
  const [queryClient] = useState(makeQueryClient);
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: Providers, ...options });
}

export * from '@testing-library/react';

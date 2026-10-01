import type { Metadata } from 'next';
import '@/styles/tokens.css';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'Weather Monitoring Portal — Sydney Metro M1',
  description:
    'Design prototype of the weather monitoring and alerting portal for the Sydney Metro M1 line. Demonstration data only.',
  // It shows live-looking readings for a named rail corridor: keep it out of search.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

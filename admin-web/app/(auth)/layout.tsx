import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('app');
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* Logo placeholder (design system) */}
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-lg font-bold">O</span>
          </div>
          <h1 className="text-lg font-semibold">{t('name')}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

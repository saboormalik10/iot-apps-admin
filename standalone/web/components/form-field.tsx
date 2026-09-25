'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Field wrapper: label + control + error. Errors are stored as i18n KEYS (from the
 * Zod schemas) and translated here, so validation copy also lives in the catalog.
 */
export function FormField({
  id,
  label,
  errorKey,
  hint,
  children,
  className,
}: {
  id: string;
  label: string;
  errorKey?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations();
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !errorKey ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {errorKey ? (
        <p id={`${id}-error`} className="text-xs text-status-error" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}

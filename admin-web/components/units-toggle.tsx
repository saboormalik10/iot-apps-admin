'use client';

import { Ruler } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useUnits } from '@/lib/units';

/**
 * Global units toggle (plan §3.4). Wired to the units context; no chart consumes
 * it until Month 8, but the admin's global choice is established + persisted now.
 */
export function UnitsToggle() {
  const { system, toggle } = useUnits();
  const t = useTranslations('shell');
  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label={`${t('units')}: ${system === 'metric' ? t('unitsMetric') : t('unitsImperial')}`} className="gap-1.5">
      <Ruler className="h-4 w-4" />
      <span className="hidden text-xs sm:inline">
        {system === 'metric' ? t('unitsMetric') : t('unitsImperial')}
      </span>
    </Button>
  );
}

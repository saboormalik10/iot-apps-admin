'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingState, ErrorState } from '@/components/screen-states';
import { Can } from '@/lib/rbac/guard';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { useDisplayUnits, useUpdateDisplayUnits } from '@/lib/units/use-units';
import { CANONICAL, UNIT_OPTIONS, type UnitFamily } from '@/lib/units/convert';
import type { DisplayUnitsInput } from '@/lib/api/types';

/**
 * Display units for this organisation.
 *
 * Presentation only, and the copy says so: stations record in m/s, hPa, °C and
 * metres, `MetMeasure` stores exactly that, and conversion happens at render
 * time. This is the whole reason the setting is safe to change at will — no
 * stored reading depends on which preference was in force when it was written.
 *
 * Org-scoped rather than per-user, so a value quoted between two colleagues at
 * the same customer means the same thing. That is also why it is admin-only and
 * audited: one person's choice moves everyone's numbers.
 */
const FAMILIES: { family: UnitFamily; labelKey: string; hintKey?: string }[] = [
  { family: 'windSpeed', labelKey: 'windSpeed', hintKey: 'windSpeedHint' },
  { family: 'pressure', labelKey: 'pressure', hintKey: 'pressureHint' },
  { family: 'temperature', labelKey: 'temperature' },
  { family: 'altitude', labelKey: 'altitude', hintKey: 'altitudeHint' },
];

type Form = Record<UnitFamily, string>;

export function DisplayUnitsForm() {
  const t = useTranslations('org.displayUnits');
  const { data: units, isLoading, isError, refetch } = useDisplayUnits();
  const update = useUpdateDisplayUnits();
  const toast = useApiToast();

  const [form, setForm] = useState<Form>({ ...CANONICAL });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!units) return;
    setForm({
      windSpeed: units.windSpeed,
      pressure: units.pressure,
      temperature: units.temperature,
      altitude: units.altitude,
    });
  }, [units]);

  if (isLoading) return <LoadingState />;
  if (isError || !units) return <ErrorState onRetry={() => refetch()} />;

  const dirty = FAMILIES.some(({ family }) => form[family] !== units[family]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Only the changed families are sent: the PATCH is partial, so an untouched
    // family should not appear in the audit row as if someone had set it.
    const changed: DisplayUnitsInput = {};
    for (const { family } of FAMILIES) {
      if (form[family] !== units![family]) changed[family] = form[family];
    }
    if (Object.keys(changed).length === 0) return;

    try {
      await update.mutateAsync(changed);
      toast.success(t('saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.save'));
    }
  }

  return (
    <Card className="p-4 md:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-medium">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        {!units.isCustomised ? (
          <p className="mt-1 text-xs text-muted-foreground">{t('default')}</p>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {FAMILIES.map(({ family, labelKey, hintKey }) => (
            <div key={family} className="space-y-1">
              <Label htmlFor={`unit-${family}`}>{t(labelKey)}</Label>
              <Can
                capability="manageOrg"
                fallback={<p className="text-sm tabular-nums">{form[family]}</p>}
              >
                <Select
                  value={form[family]}
                  onValueChange={(v) => setForm((f) => ({ ...f, [family]: v }))}
                >
                  <SelectTrigger id={`unit-${family}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS[family].map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                        {u === CANONICAL[family] ? ' · as recorded' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Can>
              {hintKey ? <p className="text-xs text-muted-foreground">{t(hintKey)}</p> : null}
            </div>
          ))}
        </div>

        {error ? <p className="text-sm text-status-error">{error}</p> : null}

        <Can capability="manageOrg" fallback={<p className="text-sm text-muted-foreground">{t('readOnly')}</p>}>
          <Button type="submit" disabled={!dirty || update.isPending}>
            {update.isPending ? t('saving') : t('save')}
          </Button>
        </Can>
      </form>
    </Card>
  );
}

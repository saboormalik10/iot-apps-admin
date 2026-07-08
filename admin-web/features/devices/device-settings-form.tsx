'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import type { DeviceSettings, SensorPref } from '@/lib/api/types';
import { deviceSettingsSchema, type DeviceSettingsInput } from '@/lib/api/schemas';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/data/confirm-dialog';
import { LoadingState, ErrorState } from '@/components/screen-states';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { useDeviceSettings, useUpdateDeviceSettings } from './use-devices';

/** Editable slice of DeviceSettings (mirrors the model; PATCH is partial). */
type Draft = Omit<DeviceSettings, 'deviceId' | 'updatedAt'>;

const WIND_UNITS = ['m/s', 'km/h', 'knots', 'mph', 'bft'];
const PRESSURE_UNITS = ['hPa', 'mbar', 'inHg', 'mmHg'];
const TEMP_UNITS = ['°C', '°F'];
const ALT_UNITS = ['m', 'ft'];
const PERIODS = ['0', '1']; // 0 = 10-min, 1 = 2-min (mirrors device windRosePeriod)

/**
 * Device Settings — the full instrument-config editor (plan §Month 8, decision #13).
 * ⚠ Writes reach the LIVE field device (shared cloud config), so submit is guarded
 * by a confirm dialog and audited server-side. The backend DTO is UNVALIDATED, so
 * client Zod (`deviceSettingsSchema`) is the SOLE guard. Admin-only surface.
 */
export function DeviceSettingsForm({ deviceId }: { deviceId: string }) {
  const { data, isLoading, isError, refetch } = useDeviceSettings(deviceId);
  const update = useUpdateDeviceSettings(deviceId);
  const toast = useApiToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) {
      const { deviceId: _d, updatedAt: _u, ...rest } = data;
      setDraft(rest);
    }
  }, [data]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify({ ...data, deviceId: undefined, updatedAt: undefined }) !==
      JSON.stringify({ ...draft, deviceId: undefined, updatedAt: undefined });
  }, [data, draft]);

  if (isLoading) return <LoadingState label="Loading settings…" />;
  if (isError || !data || !draft) return <ErrorState title="Could not load settings" onRetry={() => refetch()} />;

  const onSave = () => {
    const parsed = deviceSettingsSchema.safeParse(draft as DeviceSettingsInput);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      toast.error(new Error('Please fix the highlighted fields.'));
      return;
    }
    setErrors({});
    setConfirmOpen(true);
  };

  const commit = async () => {
    try {
      await update.mutateAsync(draft as DeviceSettingsInput);
      toast.success('Settings saved — pushed to the device');
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };

  const toggleSensor = (which: 'sensorShowPrefs' | 'sensorLogPrefs', idx: number, field: 'EnShow' | 'EnLog') => {
    const arr = draft[which];
    if (!arr) return;
    const next = arr.map((s, i) => (i === idx ? { ...s, [field]: s[field] ? 0 : 1 } : s));
    set(which, next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Device settings</h1>
        <Button onClick={onSave} disabled={!dirty || update.isPending}>
          <Save className="h-4 w-4" /> Save changes
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-status-warn/40 bg-status-warn/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warn" aria-hidden />
        <p>
          These settings are the device&apos;s live cloud configuration. Saving <strong>pushes the changes to the
          field device</strong> and records an audit entry.
        </p>
      </div>

      {/* Barometric heights */}
      <Section title="Barometric & derived">
        <SwitchRow label="QFE/QNH enabled" checked={draft.qqEnabled} onChange={(v) => set('qqEnabled', v)} />
        <SwitchRow label="Use GPS height" checked={draft.qqGpsHeight} onChange={(v) => set('qqGpsHeight', v)} />
        <NumberRow label="QFE height (m)" value={draft.qfeHeightM} onChange={(v) => set('qfeHeightM', v)} error={errors.qfeHeightM} />
        <NumberRow label="QNH height (m)" value={draft.qnhHeightM} onChange={(v) => set('qnhHeightM', v)} error={errors.qnhHeightM} />
        <SwitchRow label="Dew point enabled" checked={draft.dewPointEnabled} onChange={(v) => set('dewPointEnabled', v)} />
      </Section>

      {/* Wind rose */}
      <Section title="Wind rose">
        <SelectRow label="Orientation" value={draft.windRoseOrient} options={['true', 'relative']} onChange={(v) => set('windRoseOrient', v)} />
        <SelectRow label="Period" value={draft.windRosePeriod} options={PERIODS} onChange={(v) => set('windRosePeriod', v)} />
        <SelectRow label="Unit" value={draft.windRoseUnit} options={WIND_UNITS} onChange={(v) => set('windRoseUnit', v)} />
      </Section>

      {/* Display units */}
      <Section title="Display units">
        <SelectRow label="Wind speed" value={draft.unitWindSpeed} options={WIND_UNITS} onChange={(v) => set('unitWindSpeed', v)} />
        <SelectRow label="Pressure" value={draft.unitPressure} options={PRESSURE_UNITS} onChange={(v) => set('unitPressure', v)} />
        <SelectRow label="Temperature" value={draft.unitTemperature} options={TEMP_UNITS} onChange={(v) => set('unitTemperature', v)} />
        <SelectRow label="Altitude" value={draft.unitAltitude} options={ALT_UNITS} onChange={(v) => set('unitAltitude', v)} />
      </Section>

      {/* Graph prefs */}
      <Section title="Graph & layout">
        <NumberRow label="Graph item" value={draft.graphItem} onChange={(v) => set('graphItem', v)} error={errors.graphItem} />
        <NumberRow label="Colour scheme" value={draft.colorScheme} onChange={(v) => set('colorScheme', v)} error={errors.colorScheme} />
        <NumberRow label="Page layout" value={draft.pageLayout} onChange={(v) => set('pageLayout', v)} error={errors.pageLayout} />
      </Section>

      {/* Per-sensor NMEA show/log grid */}
      <SensorGrid title="NMEA show / log prefs" prefs={draft.sensorShowPrefs} logPrefs={draft.sensorLogPrefs} onToggle={toggleSensor} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Push settings to device?"
        description="These changes take effect on the live field device and are recorded in the audit log."
        confirmLabel="Push to device"
        onConfirm={commit}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function NumberRow({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        aria-invalid={Boolean(error)}
      />
      {error ? <p className="text-xs text-status-error">{error}</p> : null}
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SensorGrid({
  title,
  prefs,
  logPrefs,
  onToggle,
}: {
  title: string;
  prefs: SensorPref[] | null;
  logPrefs: SensorPref[] | null;
  onToggle: (which: 'sensorShowPrefs' | 'sensorLogPrefs', idx: number, field: 'EnShow' | 'EnLog') => void;
}) {
  if (!prefs || prefs.length === 0) {
    return (
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">This device has not reported its sensor list yet.</p>
      </Card>
    );
  }
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-2 font-medium">Sensor</th>
              <th className="px-2 py-2 font-medium">NMEA</th>
              <th className="px-2 py-2 font-medium">Unit</th>
              <th className="px-2 py-2 text-center font-medium">Show</th>
              <th className="px-2 py-2 text-center font-medium">Log</th>
            </tr>
          </thead>
          <tbody>
            {prefs.map((s, i) => (
              <tr key={`${s.NMEA}-${i}`} className="border-b last:border-0">
                <td className="py-2 pr-2 font-medium">{s.Desc}</td>
                <td className="px-2 py-2 tabular-nums">{s.NMEA}</td>
                <td className="px-2 py-2">{s.Unit}</td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={Boolean(s.EnShow)}
                    onChange={() => onToggle('sensorShowPrefs', i, 'EnShow')}
                    aria-label={`Show ${s.Desc}`}
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={Boolean(logPrefs?.[i]?.EnLog ?? s.EnLog)}
                    onChange={() => onToggle('sensorLogPrefs', i, 'EnLog')}
                    aria-label={`Log ${s.Desc}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

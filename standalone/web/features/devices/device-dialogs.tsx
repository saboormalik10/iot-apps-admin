'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { updateDeviceSchema } from '@/lib/api/schemas';
import type { Device, DeviceType } from '@/lib/api/types';
import { useUpdateDevice } from './use-devices';

/** Edit a station: its name, serial, raw-sample switch, rain day and heading offset. */
export function EditDeviceDialog({
  device,
  open,
  onOpenChange,
}: {
  device: Device;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState(device.customName ?? device.name);
  const [serialNo, setSerialNo] = useState(device.serialNo ?? '');
  const [firmwareVersion, setFirmwareVersion] = useState(device.firmwareVersion ?? '');
  const [storeRawSamples, setStoreRawSamples] = useState(device.storeRawSamples === true);
  const [rainDayStartHour, setRainDayStartHour] = useState(device.rainDayStartHour ?? 0);
  const [headingOffset, setHeadingOffset] = useState(String(device.headingOffsetDeg ?? 0));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = useUpdateDevice(device._id);
  const toast = useApiToast();

  const submit = async () => {
    const parsed = updateDeviceSchema.safeParse({
      customName: name || undefined,
      serialNo: serialNo || null,
      firmwareVersion: firmwareVersion || null,
      storeRawSamples,
      rainDayStartHour,
      headingOffsetDeg: headingOffset.trim() === '' ? 0 : Number(headingOffset),
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    try {
      await update.mutateAsync(parsed.data);
      toast.success('Station updated');
      onOpenChange(false);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit station</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Display name" value={name} onChange={setName} error={errors.customName} />
          <Field label="Serial number" value={serialNo} onChange={setSerialNo} error={errors.serialNo} />
          <Field label="Firmware version" value={firmwareVersion} onChange={setFirmwareVersion} error={errors.firmwareVersion} />

          {/* The rain day (client, 15 Sep 2026): "Daily rain (total) -> make this
              configurable for each station (default to 00:00 to 23:59)". */}
          <div className="space-y-1">
            <label htmlFor="rain-day" className="text-sm font-medium">Rain day starts at</label>
            <select
              id="rain-day"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={rainDayStartHour}
              onChange={(e) => setRainDayStartHour(Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00{h === 0 ? ' — midnight (default)' : h === 9 ? ' — Bureau of Meteorology 9am day' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Decides &ldquo;Rain today&rdquo; on the dashboard and where each day begins in daily query rows.
            </p>
          </div>

          {/* The heading offset had no way in once SFTP provisioning (which set it in
              the cloud) was removed: every site would have shown "uncalibrated" for good. */}
          <div className="space-y-1">
            <label htmlFor="heading-offset" className="text-sm font-medium">Heading offset (degrees)</label>
            <Input
              id="heading-offset"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={-360}
              max={360}
              value={headingOffset}
              onChange={(e) => setHeadingOffset(e.target.value)}
              aria-invalid={Boolean(errors.headingOffsetDeg)}
            />
            {errors.headingOffsetDeg ? <p className="text-xs text-status-error-strong">Enter degrees from -360 to 360.</p> : null}
            <p className="text-xs text-muted-foreground">
              Added to the sensor&apos;s bearing to give true north. With the GMX551&apos;s compass in use, enter the
              local magnetic declination (for example 11.5 for Melbourne); otherwise the sensor&apos;s alignment on the
              mast. 0 = not set. Applies to readings from now on.
            </p>
          </div>

          {/* The "special circumstance" switch. Readings are stored one record
              per minute; this additionally keeps the per-second samples the
              minute was built from, for commissioning or fault-finding. */}
          <label className="flex items-start gap-3 rounded-md border p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0"
              checked={storeRawSamples}
              onChange={(e) => setStoreRawSamples(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Keep raw per-second samples</span>
              <span className="block text-xs text-muted-foreground">
                Off by default. Readings are stored once per minute; turn this on to also keep every
                second for this station while commissioning it or investigating a fault. Raw samples
                are deleted automatically after 7 days, and are the only per-second record — export
                what you need before then.
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={update.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} />
      {error ? <p className="text-xs text-status-error">{error}</p> : null}
    </div>
  );
}

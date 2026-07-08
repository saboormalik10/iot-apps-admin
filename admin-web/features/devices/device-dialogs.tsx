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
import { createDeviceSchema, updateDeviceSchema } from '@/lib/api/schemas';
import type { Device, DeviceType } from '@/lib/api/types';
import { useCreateDevice, useUpdateDevice } from './use-devices';

/** Admin manual "Add device" dialog (devices normally auto-register on pairing). */
export function AddDeviceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [bleId, setBleId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<DeviceType>('MET-LINK');
  const [firmwareVersion, setFirmwareVersion] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateDevice();
  const toast = useApiToast();

  const submit = async () => {
    const parsed = createDeviceSchema.safeParse({ bleId, name, type, firmwareVersion: firmwareVersion || undefined });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    try {
      await create.mutateAsync(parsed.data);
      toast.success('Device added');
      onOpenChange(false);
      setBleId('');
      setName('');
      setFirmwareVersion('');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add device</DialogTitle>
          <DialogDescription>
            Devices normally auto-register when a mobile app first pairs. Add one manually only if needed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="BLE ID" value={bleId} onChange={setBleId} error={errors.bleId} />
          <Field label="Name" value={name} onChange={setName} error={errors.name} />
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as DeviceType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MET-LINK">MET-LINK</SelectItem>
                <SelectItem value="NEP-LINK">NEP-LINK</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field label="Firmware version (optional)" value={firmwareVersion} onChange={setFirmwareVersion} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Add device</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Edit a device's name / serial / firmware. */
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = useUpdateDevice(device._id);
  const toast = useApiToast();

  const submit = async () => {
    const parsed = updateDeviceSchema.safeParse({
      customName: name || undefined,
      serialNo: serialNo || null,
      firmwareVersion: firmwareVersion || null,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    try {
      await update.mutateAsync(parsed.data);
      toast.success('Device updated');
      onOpenChange(false);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit device</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Display name" value={name} onChange={setName} error={errors.customName} />
          <Field label="Serial number" value={serialNo} onChange={setSerialNo} error={errors.serialNo} />
          <Field label="Firmware version" value={firmwareVersion} onChange={setFirmwareVersion} error={errors.firmwareVersion} />
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

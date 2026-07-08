'use client';

import { Cpu, Waves } from 'lucide-react';
import type { DeviceType } from '@/lib/api/types';
import { useDashboardDevices } from '@/features/dashboard/use-dashboard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL = '__all__';

/**
 * DeviceSelect — picks a device (or "All"), optionally filtered to a device type.
 * Backed by the lightweight `/dashboard/devices` list. Used by the Scope Bar and
 * device-scoped panels.
 */
export function DeviceSelect({
  value,
  onChange,
  type,
  allowAll = true,
  allLabel = 'All devices',
  placeholder = 'Select device',
  className,
}: {
  value?: string;
  onChange: (deviceId: string | undefined) => void;
  type?: DeviceType;
  allowAll?: boolean;
  allLabel?: string;
  placeholder?: string;
  className?: string;
}) {
  const { data: devices = [] } = useDashboardDevices();
  const filtered = type ? devices.filter((d) => d.type === type) : devices;

  return (
    <Select
      value={value ?? (allowAll ? ALL : undefined)}
      onValueChange={(v) => onChange(v === ALL ? undefined : v)}
    >
      <SelectTrigger className={className} aria-label="Device">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowAll ? <SelectItem value={ALL}>{allLabel}</SelectItem> : null}
        {filtered.map((d) => (
          <SelectItem key={d._id} value={d._id}>
            <span className="flex items-center gap-2">
              {d.type === 'MET-LINK' ? <Cpu className="h-3.5 w-3.5" /> : <Waves className="h-3.5 w-3.5" />}
              {d.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

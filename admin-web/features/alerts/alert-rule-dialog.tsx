'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isFeatureEnabled } from '@/lib/config/flags';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { useDashboardDevices } from '@/features/dashboard/use-dashboard';
import { listUsers } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { alertRuleSchema, updateAlertRuleSchema } from '@/lib/api/schemas';
import type { AlertRuleInput } from '@/lib/api/schemas';
import type { AlertAppType, AlertCondition, AlertRule } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import {
  APP_TYPE_TO_DEVICE_TYPE,
  CONDITION_OPTIONS,
  sensorOptionsFor,
} from './alert-constants';
import { useCreateAlertRule, useUpdateAlertRule, useBulkCreateAlertRules } from './use-alerts';

type FieldErrors = Record<string, string>;

export function AlertRuleDialog({
  rule,
  open,
  onOpenChange,
}: {
  rule?: AlertRule;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const isEdit = Boolean(rule);
  const toast = useApiToast();
  const { data: devices = [] } = useDashboardDevices();
  const { data: usersPage } = useQuery({ queryKey: queryKeys.users, queryFn: ({ signal }) => listUsers(signal) });
  const users = usersPage?.rows ?? [];

  const create = useCreateAlertRule();
  const update = useUpdateAlertRule(rule?._id ?? '');
  const bulk = useBulkCreateAlertRules();

  // ── Form state (seeded from `rule` in edit mode) ──
  const [name, setName] = useState(rule?.name ?? '');
  const [appType, setAppType] = useState<AlertAppType>(rule?.appType ?? 'MET');
  const [deviceIds, setDeviceIds] = useState<string[]>(rule ? [rule.deviceId] : []);
  const [sensor, setSensor] = useState(rule?.sensor ?? '');
  const [condition, setCondition] = useState<AlertCondition>(rule?.condition ?? 'gt');
  const [threshold, setThreshold] = useState(rule ? String(rule.threshold) : '');
  const [unit, setUnit] = useState(rule?.unit ?? '');
  const [cooldown, setCooldown] = useState(String(rule?.cooldownMinutes ?? 60));
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>(rule?.notifyUserIds ?? []);
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});

  /**
   * Offer only sensors every selected device actually reports.
   *
   * The static list has six MET sensors; the wind station reports two. Offering
   * the other four lets an operator build a rule that can never fire — it would
   * simply sit there looking armed. The INTERSECTION is used rather than the
   * union because the dialog creates one rule per selected device.
   *
   * Fails open: with nothing selected yet, or for devices that have not ingested,
   * every sensor is offered.
   */
  const sensorOptions = useMemo(() => {
    const all = sensorOptionsFor(appType);
    const chosen = devices.filter((d) => deviceIds.includes(d._id));
    const withKnownSensors = chosen.filter((d) => (d.availableSensors?.length ?? 0) > 0);
    if (withKnownSensors.length === 0) return all;
    return all.filter((opt) => withKnownSensors.every((d) => d.availableSensors!.includes(opt.key)));
  }, [appType, devices, deviceIds]);
  const eligibleDevices = useMemo(
    () => devices.filter((d) => d.type === APP_TYPE_TO_DEVICE_TYPE[appType]),
    [devices, appType],
  );

  const pending = create.isPending || update.isPending || bulk.isPending;

  const onAppTypeChange = (next: AlertAppType) => {
    setAppType(next);
    setSensor('');
    setUnit('');
    setDeviceIds([]);
  };

  const onSensorChange = (key: string) => {
    setSensor(key);
    // Pre-fill the sensor's conventional unit (still editable).
    const opt = sensorOptions.find((s) => s.key === key);
    if (opt) setUnit(opt.unit);
  };

  const toggleDevice = (id: string) =>
    setDeviceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleUser = (id: string) =>
    setNotifyUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    setErrors({});
    const base = {
      name: name.trim(),
      appType,
      sensor,
      condition,
      threshold: Number(threshold),
      unit: unit.trim(),
      cooldownMinutes: Number(cooldown),
      notifyUserIds,
      isActive,
    };

    if (isEdit && rule) {
      // Device + appType are immutable on edit (the DTO omits them).
      const parsed = updateAlertRuleSchema.safeParse(base);
      if (!parsed.success) return setErrors(collect(parsed.error.issues));
      if (!sensorOptions.some((s) => s.key === sensor)) {
        return setErrors({ sensor: `Not a valid ${appType} sensor` });
      }
      try {
        await update.mutateAsync(parsed.data);
        toast.success('Alert rule updated');
        onOpenChange(false);
      } catch (e) {
        toast.error(e);
      }
      return;
    }

    // Create — validate one spec per selected device.
    if (deviceIds.length === 0) return setErrors({ device: 'Select at least one device' });
    const specs: AlertRuleInput[] = [];
    for (const deviceId of deviceIds) {
      const parsed = alertRuleSchema.safeParse({ ...base, deviceId });
      if (!parsed.success) return setErrors(collect(parsed.error.issues));
      specs.push(parsed.data);
    }

    try {
      if (specs.length === 1) {
        await create.mutateAsync(specs[0]);
        toast.success('Alert rule created');
      } else {
        const { created, failed } = await bulk.mutateAsync(specs);
        if (failed > 0) toast.info(`Created ${created} of ${specs.length} rules (${failed} failed)`);
        else toast.success(`Created ${created} alert rules`);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit alert rule' : 'New alert rule'}</DialogTitle>
          <DialogDescription>
            Fires a notification when a device&apos;s sensor reading crosses your threshold. Repeat alerts are
            suppressed for the cooldown window.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Rule name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. High turbidity" aria-invalid={Boolean(errors.name)} />
            {errors.name ? <p className="text-xs text-status-error">{errors.name}</p> : null}
          </div>

          {/* App type */}
          <div className="space-y-1">
            <Label>Application</Label>
            <Select value={appType} onValueChange={(v) => onAppTypeChange(v as AlertAppType)} disabled={isEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MET">MET-LINK (weather)</SelectItem>
                {/* NEP is switched off (M15 W4) — it has no live data source, so a
                    rule built against it could never fire. The option returns with
                    the feature. */}
                {isFeatureEnabled('nepAnalytics') ? (
                  <SelectItem value="NEP">NEP-LINK (water quality)</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>

          {/* Device(s) */}
          <div className="space-y-1.5">
            <Label>{isEdit ? 'Device' : 'Device(s)'}</Label>
            {isEdit ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {devices.find((d) => d._id === rule?.deviceId)?.name ?? rule?.deviceId}
              </p>
            ) : eligibleDevices.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                No {APP_TYPE_TO_DEVICE_TYPE[appType]} devices in this organization yet.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {eligibleDevices.map((d) => {
                    const on = deviceIds.includes(d._id);
                    return (
                      <button
                        key={d._id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleDevice(d._id)}
                        className={cn(
                          'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                          on ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {on ? <Check className="h-3 w-3" /> : null}
                        {d.name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {deviceIds.length > 1
                    ? `This rule will be created on ${deviceIds.length} devices.`
                    : 'Select one or more devices to apply this rule to.'}
                </p>
              </>
            )}
            {errors.device ? <p className="text-xs text-status-error">{errors.device}</p> : null}
          </div>

          {/* Sensor + condition + threshold */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_1.2fr_1fr]">
            <div className="space-y-1">
              <Label>Sensor</Label>
              <Select value={sensor} onValueChange={onSensorChange}>
                <SelectTrigger aria-invalid={Boolean(errors.sensor)}><SelectValue placeholder="Sensor" /></SelectTrigger>
                <SelectContent>
                  {sensorOptions.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.sensor ? <p className="text-xs text-status-error">{errors.sensor}</p> : null}
            </div>
            <div className="space-y-1">
              <Label>Condition</Label>
              <Select value={condition} onValueChange={(v) => setCondition(v as AlertCondition)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITION_OPTIONS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Threshold</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                aria-invalid={Boolean(errors.threshold)}
              />
              {errors.threshold ? <p className="text-xs text-status-error">{errors.threshold}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Unit</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. NTU" aria-invalid={Boolean(errors.unit)} />
              {errors.unit ? <p className="text-xs text-status-error">{errors.unit}</p> : null}
            </div>
            <div className="space-y-1">
              <Label>Cooldown (minutes)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={cooldown}
                onChange={(e) => setCooldown(e.target.value)}
                aria-invalid={Boolean(errors.cooldownMinutes)}
              />
              {errors.cooldownMinutes ? <p className="text-xs text-status-error">{errors.cooldownMinutes}</p> : null}
            </div>
          </div>

          {/* Notify users */}
          <div className="space-y-1.5">
            <Label>Notify</Label>
            {users.length === 0 ? (
              <p className="text-xs text-muted-foreground">No other members to notify. The whole org is notified by default.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {users.map((u) => {
                    const on = notifyUserIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleUser(u.id)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs transition-colors',
                          on ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {u.firstName || u.lastName ? `${u.firstName} ${u.lastName}`.trim() : u.email}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {notifyUserIds.length === 0 ? 'No one selected → the whole organization is notified.' : `${notifyUserIds.length} selected.`}
                </p>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch id="rule-active" checked={isActive} onCheckedChange={setIsActive} />
            <Label htmlFor="rule-active" className="text-sm">Active (armed)</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>
            {isEdit ? 'Save changes' : deviceIds.length > 1 ? `Create ${deviceIds.length} rules` : 'Create rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function collect(issues: { path: (string | number)[]; message: string }[]): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues) {
    const key = String(i.path[0] ?? 'form');
    if (!out[key]) out[key] = i.message;
  }
  return out;
}

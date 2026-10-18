'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type {
  AlertRule,
  BucketMm,
  Instrument,
  InstrumentKind,
  LocationId,
  Organization,
  ParameterId,
  StationMeasure,
  TrackDirection,
} from '@/lib/api/types';
import {
  INSTRUMENT_CATALOG,
  addInstrument,
  addStation,
  listInstruments,
  listRules,
  saveRule,
} from '@/lib/api/endpoints';
import { RightNotice } from '@/components/admin/right-notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/lib/hooks/use-toast';
import { useActing } from '@/lib/use-data';
import { cn } from '@/lib/utils';

/**
 * Setting up a station, start to finish (client, 13 Oct 2026: "think of the setup
 * for adding station and the sensors in each station").
 *
 *   1. Station   — where it is and which logger it reports through
 *   2. Sensors   — what is fitted, each with its sensor ID and serial number
 *   3. Alerts    — which of the alert rules start watching it
 *   4. Review    — one look at everything, then save
 *
 * The station and its sensors start in Commissioning: nothing they report feeds
 * an alert until they are put in service.
 */

const STEPS = ['Station', 'Sensors', 'Alerts', 'Review'] as const;
const KINDS: InstrumentKind[] = ['rain', 'level', 'float', 'gmx', 'wind'];
const BUCKETS: BucketMm[] = [0.1, 0.2, 0.5, 1.0];

/** Which instrument a rule reads from. */
const KIND_OF_PARAMETER: Partial<Record<ParameterId, InstrumentKind>> = {
  rainfall: 'rain',
  water_level: 'level',
  float_switch: 'float',
  temperature: 'gmx',
  humidity: 'gmx',
  pressure: 'gmx',
  wind_mean: 'wind',
  wind_gust: 'wind',
  wind_dir: 'wind',
};

/** What a station "measures", for the station list, from its sensors. */
const MEASURE_OF_KIND: Record<InstrumentKind, StationMeasure> = {
  rain: 'rain',
  level: 'flood',
  float: 'flood',
  gmx: 'temp',
  wind: 'wind',
};

interface SensorDraft {
  on: boolean;
  sensorId: string;
  serial: string;
  bucketMm: BucketMm;
}

const sel = 'h-9 w-full rounded-md border bg-background px-2 text-sm';

export function AddStationWizard({ orgs, onClose }: { orgs: Organization[]; onClose: () => void }) {
  const { can } = useActing();
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // 1. Station
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? 'mts');
  const [name, setName] = useState('');
  const [chainage, setChainage] = useState('');
  const [track, setTrack] = useState<TrackDirection>('both');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [loggerId, setLoggerId] = useState('');

  // 2. Sensors
  const [existing, setExisting] = useState<Instrument[]>([]);
  const [sensors, setSensors] = useState<Record<InstrumentKind, SensorDraft>>(
    () =>
      Object.fromEntries(
        KINDS.map((k) => [k, { on: false, sensorId: '', serial: '', bucketMm: 0.2 as BucketMm }]),
      ) as Record<InstrumentKind, SensorDraft>,
  );
  const [pumps, setPumps] = useState(false);
  const mayAddSensors = can('addSensors', orgId);

  // 3. Alerts
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [ruleOn, setRuleOn] = useState<Record<string, boolean>>({});

  useEffect(() => {
    listInstruments().then(setExisting);
    listRules().then(setRules);
  }, []);

  const prefix = loggerId.trim() ? loggerId.trim().replace(/-\d+$/, '') + '-' : 'NEW-';
  const suggest = (k: InstrumentKind) => `${prefix}${INSTRUMENT_CATALOG[k].code}-01`;
  const chosen = KINDS.filter((k) => sensors[k].on);
  const sensorIdOf = (k: InstrumentKind) => sensors[k].sensorId.trim() || suggest(k);
  const applicable = useMemo(
    () =>
      rules.filter(
        (r) => r.enabled && chosen.includes(KIND_OF_PARAMETER[r.parameter] as InstrumentKind),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, chosen.join()],
  );
  const applies = (r: AlertRule) => ruleOn[r.id] ?? true;

  const gpsGiven = lat.trim() !== '' || lng.trim() !== '';
  const latN = Number(lat);
  const lngN = Number(lng);
  const stationErrors = {
    name: name.trim() ? undefined : 'Name the station.',
    loggerId: loggerId.trim() ? undefined : 'Enter the logger ID (for example HLP-01).',
    gps:
      gpsGiven &&
      !(
        Number.isFinite(latN) &&
        Number.isFinite(lngN) &&
        Math.abs(latN) <= 90 &&
        Math.abs(lngN) <= 180
      )
        ? 'Latitude −90 to 90, longitude −180 to 180 — or leave both blank.'
        : undefined,
  };
  const sensorErrors: Partial<Record<InstrumentKind, string>> = {};
  for (const k of chosen) {
    if (!sensors[k].serial.trim()) sensorErrors[k] = 'Enter the serial number from the instrument.';
    else if (existing.some((i) => i.sensorId === sensorIdOf(k)))
      sensorErrors[k] = 'That sensor ID is already in the register.';
  }
  const stepInvalid =
    step === 0
      ? Object.values(stationErrors).some(Boolean)
      : step === 1
        ? Object.keys(sensorErrors).length > 0 || (!chosen.length && !pumps)
        : false;

  const next = () => {
    setTouched(true);
    if (stepInvalid) return;
    setTouched(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const save = async () => {
    setSaving(true);
    const measures = [
      ...new Set([
        ...chosen.map((k) => MEASURE_OF_KIND[k]),
        ...(pumps ? (['pump'] as StationMeasure[]) : []),
      ]),
    ];
    const id = await addStation({
      orgId,
      name: name.trim(),
      chainage: chainage.trim() || 'to be confirmed',
      gps: gpsGiven ? { lat: latN, lng: lngN } : undefined,
      loggerId: loggerId.trim(),
      track,
      measures,
    });
    // The sensors and the rule changes do not depend on each other; save them together.
    await Promise.all([
      ...chosen.map((k) =>
        addInstrument({
          sensorId: sensorIdOf(k),
          locationId: id as LocationId,
          loggerId: loggerId.trim(),
          kind: k,
          serial: sensors[k].serial.trim(),
          bucketMm: k === 'rain' ? sensors[k].bucketMm : undefined,
          mounting: INSTRUMENT_CATALOG[k].mounting,
        }),
      ),
      ...applicable
        .filter(applies)
        .map((r) => saveRule(r.id, { appliesTo: [...r.appliesTo, id as LocationId] })),
    ]);
    toast({
      variant: 'success',
      title: `${name.trim()} added (simulated)`,
      description: `${chosen.length} sensor${chosen.length === 1 ? '' : 's'} · ${applicable.filter(applies).length} alert rules · Commissioning`,
    });
    onClose();
  };

  const err = (e?: string) =>
    touched && e ? <span className="mt-1 block text-xs text-sev-alert-strong">{e}</span> : null;
  const label = 'mb-1 block text-xs text-muted-foreground';
  const set = (k: InstrumentKind, patch: Partial<SensorDraft>) =>
    setSensors((s) => ({ ...s, [k]: { ...s[k], ...patch } }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add station</DialogTitle>
          <DialogDescription>
            Set up the station, its sensors and its alerts. It starts in Commissioning.
          </DialogDescription>
        </DialogHeader>

        {/* Where you are in the four steps. */}
        <ol className="flex items-center gap-1 text-xs" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className="flex flex-1 items-center gap-1.5"
              aria-current={i === step ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                  i < step && 'border-primary bg-primary text-primary-foreground',
                  i === step && 'border-primary text-primary',
                  i > step && 'text-muted-foreground',
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  'font-medium',
                  i === step ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {s}
              </span>
              {i < STEPS.length - 1 ? (
                <span className="mx-1 h-px flex-1 bg-border" aria-hidden />
              ) : null}
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {orgs.length > 1 ? (
              <label className="block text-sm sm:col-span-2">
                <span className={label}>Organisation</span>
                <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={sel}>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block text-sm">
              <span className={label}>Station name</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Hurlstone Park"
                className="h-9"
              />
              {err(stationErrors.name)}
            </label>
            <label className="block text-sm">
              <span className={label}>Logger ID</span>
              <Input
                value={loggerId}
                onChange={(e) => setLoggerId(e.target.value.toUpperCase())}
                placeholder="HLP-01"
                className="tabular h-9"
              />
              {err(stationErrors.loggerId)}
            </label>
            <label className="block text-sm">
              <span className={label}>Chainage</span>
              <Input
                value={chainage}
                onChange={(e) => setChainage(e.target.value)}
                placeholder="MSW 8.100–8.250"
                className="h-9"
              />
            </label>
            <label className="block text-sm">
              <span className={label}>Track</span>
              <select
                value={track}
                onChange={(e) => setTrack(e.target.value as TrackDirection)}
                className={sel}
              >
                <option value="both">Both</option>
                <option value="up">Up</option>
                <option value="down">Down</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className={label}>GPS latitude</span>
              <Input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="-33.9123"
                className="tabular h-9"
                inputMode="decimal"
              />
            </label>
            <label className="block text-sm">
              <span className={label}>GPS longitude</span>
              <Input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="151.1234"
                className="tabular h-9"
                inputMode="decimal"
              />
            </label>
            <div className="sm:col-span-2">
              {err(stationErrors.gps)}
              <p className="text-[11px] text-muted-foreground">
                Leave GPS blank until the site survey; it shows as “pending survey”.
              </p>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Tick what is fitted at {name.trim() || 'the station'}. Each sensor is wired to{' '}
              {loggerId.trim() || 'the logger'}.
            </p>
            {!mayAddSensors ? <RightNotice right="addSensors" /> : null}
            {KINDS.map((k) => {
              const d = sensors[k];
              const c = INSTRUMENT_CATALOG[k];
              return (
                <div
                  key={k}
                  className={cn('rounded-md border p-3', d.on && 'border-primary/50 bg-primary/5')}
                >
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={d.on}
                      disabled={!mayAddSensors}
                      onChange={(e) => set(k, { on: e.target.checked })}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{c.label}</span>
                      <span className="block text-xs text-muted-foreground">{c.model}</span>
                    </span>
                  </label>
                  {d.on ? (
                    <div className="mt-2 grid gap-2 pl-6 sm:grid-cols-3">
                      <label className="block text-sm">
                        <span className={label}>Sensor ID</span>
                        <Input
                          value={d.sensorId}
                          placeholder={suggest(k)}
                          onChange={(e) => set(k, { sensorId: e.target.value.toUpperCase() })}
                          className="tabular h-9"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className={label}>Serial number</span>
                        <Input
                          value={d.serial}
                          onChange={(e) => set(k, { serial: e.target.value })}
                          className="tabular h-9"
                        />
                      </label>
                      {k === 'rain' ? (
                        <label className="block text-sm">
                          <span className={label}>Bucket size</span>
                          <select
                            value={d.bucketMm}
                            onChange={(e) =>
                              set(k, { bucketMm: Number(e.target.value) as BucketMm })
                            }
                            className={sel}
                          >
                            {BUCKETS.map((b) => (
                              <option key={b} value={b}>
                                {b} mm per tip
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <div className="sm:col-span-3">{err(sensorErrors[k])}</div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <label
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-md border p-3',
                pumps && 'border-primary/50 bg-primary/5',
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={pumps}
                onChange={(e) => setPumps(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium">Pump station</span>
                <span className="block text-xs text-muted-foreground">
                  Duty and standby pumps controlled by the logger
                </span>
              </span>
            </label>
            {touched && !chosen.length && !pumps ? (
              <span className="block text-xs text-sev-alert-strong">
                Choose at least one sensor.
              </span>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              These alert rules read the sensors you chose. Ticked rules start watching{' '}
              {name.trim()} with their thresholds; change a threshold under Alert rules.
            </p>
            {applicable.length ? (
              <ul className="divide-y rounded-md border">
                {applicable.map((r) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={applies(r)}
                        onChange={(e) => setRuleOn((s) => ({ ...s, [r.id]: e.target.checked }))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{r.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.message?.slice(0, 90)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-medium',
                          r.severity === 'alert'
                            ? 'bg-sev-alert-tint text-sev-alert-strong'
                            : 'bg-sev-warning-tint text-sev-warning-strong',
                        )}
                      >
                        {r.severity === 'alert' ? 'Alert' : 'Warning'}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                No alert rule reads these sensors.
              </p>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <dl className="divide-y rounded-md border text-sm">
            <Review label="Station">
              {name.trim()} · logger <span className="tabular">{loggerId.trim()}</span> ·{' '}
              {chainage.trim() || 'chainage to be confirmed'} · {track} track
              {gpsGiven ? ` · ${latN.toFixed(5)}, ${lngN.toFixed(5)}` : ' · GPS pending survey'}
            </Review>
            <Review label="Sensors">
              {chosen.length || pumps ? (
                <ul className="space-y-0.5">
                  {chosen.map((k) => (
                    <li key={k}>
                      <span className="tabular font-medium">{sensorIdOf(k)}</span> —{' '}
                      {INSTRUMENT_CATALOG[k].label}, serial {sensors[k].serial.trim()}
                      {k === 'rain' ? `, ${sensors[k].bucketMm} mm bucket` : ''}
                    </li>
                  ))}
                  {pumps ? <li>Pump station (duty + standby)</li> : null}
                </ul>
              ) : (
                'None'
              )}
            </Review>
            <Review label="Alerts">
              {applicable.filter(applies).length
                ? applicable
                    .filter(applies)
                    .map((r) => r.name)
                    .join(', ')
                : 'None'}
            </Review>
            <Review label="Status">
              Commissioning — no alerts are raised from it until its sensors are put in service.
            </Review>
          </dl>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={step === 0 ? onClose : () => setStep(step - 1)}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>Next: {STEPS[step + 1]}</Button>
          ) : (
            <Button onClick={save} disabled={saving}>
              {saving ? 'Adding…' : 'Add station'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Review({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-3 py-2 sm:grid-cols-[7rem_1fr]">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
